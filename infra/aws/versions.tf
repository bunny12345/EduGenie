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

# Credentials are intentionally NOT pinned to a specific profile here — the
# provider follows the standard AWS credential chain instead: env vars
# (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, as set by GitHub Actions'
# configure-aws-credentials) take priority, falling back to the shared
# ~/.aws/credentials file locally (respecting AWS_PROFILE if you set it).
# Hardcoding profile = "default" here previously broke CI, which has no
# shared config file at all — only env-var credentials.
provider "aws" {
  region = var.aws_region
}

# CloudFront + its ACM certificate must be requested in us-east-1 regardless of
# where the rest of the infra (EC2/ALB/API cert) lives.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
