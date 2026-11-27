#!/bin/bash
# Prepares a fresh dev host: Docker only. App deployment is done by dev.sh.
dnf install -y docker rsync
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /srv/academix/web /srv/academix/backend /srv/academix/caddy
chown -R ec2-user:ec2-user /srv/academix
touch /var/lib/cloud/instance/academix-ready
