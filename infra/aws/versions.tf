terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state so local runs and CI (GitHub Actions) share the same source
  # of truth — without this, CI would think no resources exist and could try
  # to recreate everything already live in production.
  backend "s3" {
    bucket       = "academix-terraform-state-931886962745"
    key          = "academix/terraform.tfstate"
    region       = "ap-south-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# CloudFront + its ACM certificate must be requested in us-east-1 regardless of
# where the rest of the infra (EC2/ALB/API cert) lives.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
}
