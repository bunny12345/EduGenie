variable "aws_region" {
  description = "AWS region for regional resources (EC2, ALB, the api.academix.now ACM cert)."
  type        = string
  default     = "ap-south-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use. Must be a least-privilege IAM user, never the account root user."
  type        = string
  default     = "default"
}

variable "domain_name" {
  description = "Root domain for the app."
  type        = string
  default     = "academix.now"
}

variable "hosted_zone_id" {
  description = <<-EOT
    Existing Route 53 hosted zone id for domain_name. Referenced as a data
    source (not managed here) on purpose: recreating the zone would assign new
    nameservers and break the domain until Namecheap is updated manually again.
  EOT
  type        = string
  default     = "Z00076871CJRZNP45H78P"
}

variable "ec2_key_pair_name" {
  description = "Existing EC2 key pair name. The private key lives only on operators' machines (~/.ssh/academix/), never in this repo."
  type        = string
  default     = "academix-backend"
}

variable "ssh_allowed_cidr" {
  description = <<-EOT
    CIDR allowed to SSH into the backend instance. Defaults to 0.0.0.0/0
    because the operator's home connection uses a rapidly-rotating public IP
    (CGNAT), making a single-IP allowlist impractical. SSH is key-only auth
    (no password auth). Narrow this to a stable IP/VPN range if one becomes
    available, or replace SSH entirely with AWS Systems Manager Session
    Manager (no inbound port needed).
  EOT
  type        = string
  default     = "0.0.0.0/0"
}

variable "backend_instance_type" {
  description = "EC2 instance type for the backend."
  type        = string
  default     = "t3.small"
}

variable "backend_ami_id" {
  description = "AMI id for the backend instance (Amazon Linux 2023, ap-south-1). Re-resolve via the /aws/service/ami-amazon-linux-latest SSM parameter if this instance is ever replaced."
  type        = string
  default     = "ami-090d68841c2a28756"
}

variable "backend_subnet_id" {
  description = "Subnet the backend EC2 instance runs in."
  type        = string
  default     = "subnet-0a620799851ca6d63" # ap-south-1a, default VPC
}

variable "alb_subnet_ids" {
  description = "Subnets (one per AZ) the ALB is attached to."
  type        = list(string)
  default = [
    "subnet-0a620799851ca6d63", # ap-south-1a
    "subnet-082c4bedcd79b288f", # ap-south-1b
    "subnet-055b0986cc1c5aaf7", # ap-south-1c
  ]
}

variable "frontend_bucket_name" {
  description = "S3 bucket name hosting the built React frontend."
  type        = string
  default     = "academix-frontend-931886962745"
}

variable "backend_route_prefixes" {
  description = <<-EOT
    Backend NestJS @Controller() route prefixes that must be proxied from
    CloudFront to the ALB origin so the frontend (served from the same
    academix.now domain) can reach the API without CORS/mixed-content issues.
    IMPORTANT: add a new entry here (and re-apply) whenever a new top-level
    controller is added under backend/src, or its routes will 404 through
    academix.now even though they work when hitting the ALB/api.academix.now
    directly.
  EOT
  type        = list(string)
  default = [
    "auth", "chat", "dashboard", "orchard", "games", "homework", "progress",
    "calendar", "rewards", "tests", "library", "settings", "teacher", "school",
    "curriculum", "uploads", "health",
  ]
}
