#!/bin/bash
# Deploys the backend app onto the EC2 instance managed by this Terraform config,
# and/or the frontend build to S3 + CloudFront. This is the "app-level" half of
# the recovery pipeline — Terraform only provisions infrastructure; this script
# does the actual code deploy, the same way it was done manually when this infra
# was first set up.
#
# Usage:
#   ./deploy.sh backend    # rsync src + Dockerfile, rebuild image, restart container
#   ./deploy.sh frontend   # build React app, sync to S3, invalidate CloudFront
#   ./deploy.sh all        # both
#
# Prerequisites:
#   - terraform apply already run in this directory (so the EC2 instance/ALB/etc exist)
#   - ~/.ssh/academix/academix-backend.pem present locally (never committed to git)
#   - backend/.env present locally with real secrets (gitignored, never committed)
#   - AWS CLI configured with the `default` profile (an IAM user, not root)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_PROFILE="${AWS_PROFILE:-default}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
KEY_PATH="${ACADEMIX_SSH_KEY:-$HOME/.ssh/academix/academix-backend.pem}"
DISTRIBUTION_ID="E2E22WW9CW3J01"
FRONTEND_BUCKET="academix-frontend-931886962745"
INSTANCE_ID="i-09634ed5e8cb9575b"

deploy_backend() {
  echo "==> Looking up current instance public IP (changes on every stop/start)..."
  local ip
  ip=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  echo "    $ip"

  echo "==> Syncing backend source + Dockerfile to the server..."
  ssh -i "$KEY_PATH" -o StrictHostKeyChecking=accept-new "ec2-user@${ip}" "mkdir -p ~/EduGenie/backend/src"
  rsync -az -e "ssh -i $KEY_PATH" "$REPO_ROOT/backend/src/" "ec2-user@${ip}:~/EduGenie/backend/src/"
  scp -i "$KEY_PATH" "$REPO_ROOT/backend/Dockerfile" "$REPO_ROOT/backend/.dockerignore" \
    "$REPO_ROOT/backend/package.json" "$REPO_ROOT/backend/package-lock.json" \
    "$REPO_ROOT/backend/tsconfig.json" "$REPO_ROOT/backend/tsconfig.build.json" \
    "ec2-user@${ip}:~/EduGenie/backend/"

  echo "==> Copying production .env (only if the server doesn't already have one)..."
  if ! ssh -i "$KEY_PATH" "ec2-user@${ip}" "test -f ~/EduGenie/backend/.env"; then
    echo "    No .env found on server — copying from local backend/.env."
    echo "    Reminder: this local copy should already be prod-ready (rotated JWT secret, LLM_PROVIDER=openai, ALLOWED_ORIGINS set)."
    scp -i "$KEY_PATH" "$REPO_ROOT/backend/.env" "ec2-user@${ip}:~/EduGenie/backend/.env"
  fi

  echo "==> Building and restarting the container..."
  ssh -i "$KEY_PATH" "ec2-user@${ip}" '
    set -e
    cd ~/EduGenie/backend
    sudo docker build -t academix-backend:latest .
    sudo docker rm -f academix-backend 2>/dev/null || true
    sudo docker run -d --name academix-backend --restart unless-stopped -p 3000:3000 --env-file .env academix-backend:latest
    sleep 3
    sudo docker ps
  '
  echo "==> Backend deploy complete."
}

deploy_frontend() {
  echo "==> Building frontend (same-origin API via CloudFront proxy)..."
  ( cd "$REPO_ROOT/web" && REACT_APP_API_URL=https://academix.now npx react-scripts build )

  echo "==> Syncing build/ to S3..."
  aws s3 sync "$REPO_ROOT/web/build/" "s3://${FRONTEND_BUCKET}/" --delete --profile "$AWS_PROFILE"

  echo "==> Invalidating CloudFront cache..."
  aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths '/*' --profile "$AWS_PROFILE"
  echo "==> Frontend deploy complete."
}

case "${1:-}" in
  backend) deploy_backend ;;
  frontend) deploy_frontend ;;
  all) deploy_backend; deploy_frontend ;;
  *)
    echo "Usage: $0 {backend|frontend|all}" >&2
    exit 1
    ;;
esac
