terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Same state bucket as production but a DIFFERENT key, so `terraform destroy`
  # here can never touch production resources.
  backend "s3" {
    bucket       = "academix-terraform-state-931886962745"
    key          = "academix/dev/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "instance_type" {
  description = "Dev host size. t3.small runs the backend, Caddy and the website comfortably."
  type        = string
  default     = "t3.small"
}

variable "key_name" {
  description = "EC2 key pair created by dev.sh init (separate from the production key)."
  type        = string
  default     = "academix-dev"
}

variable "subnet_id" {
  type    = string
  default = "subnet-0a620799851ca6d63" # ap-south-1a, default VPC
}

data "aws_vpc" "default" {
  default = true
}

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# Only port 80 is open to the world (Let's Encrypt certificate issuance and the
# HTTPS redirect). SSH (22) and HTTPS (443) are opened to the operator's current
# IP only, by `dev.sh allow-me`, so the dev site is not publicly reachable.
resource "aws_security_group" "dev" {
  name        = "academix-dev"
  description = "AcademiX development host"
  vpc_id      = data.aws_vpc.default.id
  tags        = { Name = "academix-dev", Environment = "dev" }

  lifecycle {
    ignore_changes = [ingress]
  }
}

resource "aws_vpc_security_group_ingress_rule" "acme_http" {
  security_group_id = aws_security_group.dev.id
  description       = "HTTP for certificate issuance and redirect"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.dev.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_instance" "dev" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  key_name                    = var.key_name
  vpc_security_group_ids      = [aws_security_group.dev.id]
  associate_public_ip_address = true
  user_data                   = file("${path.module}/files/user_data.sh")

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_size           = 20
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  tags = { Name = "academix-dev", Environment = "dev" }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

output "instance_id" {
  value = aws_instance.dev.id
}

output "security_group_id" {
  value = aws_security_group.dev.id
}
