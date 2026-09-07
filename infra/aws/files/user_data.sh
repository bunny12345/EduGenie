#!/bin/bash
# EC2 user-data: prepares a fresh instance to run the backend Docker container.
# App deployment itself (cloning the repo, building the image, running the
# container with the production .env) is handled by infra/aws/deploy.sh — this
# script only needs to make `docker` available.
dnf update -y
dnf install -y docker git
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user
