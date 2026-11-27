#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
region=ap-south-1
instance=i-052e104af76d23a8d
sg=sg-0ba8af62c9cb078d8
host=dev.academix.now
tmp="$(mktemp -d)"
rule_ids=()
cleanup() {
  local result=$?
  trap - EXIT
  if [ "${#rule_ids[@]}" -gt 0 ]; then
    if ! aws ec2 revoke-security-group-ingress --region "$region" --group-id "$sg" --security-group-rule-ids "${rule_ids[@]}" >/dev/null; then
      echo "Failed to remove temporary runner ingress rules: ${rule_ids[*]}; remove them manually." >&2
      result=1
    fi
  fi
  rm -f "$tmp/key" "$tmp/known_hosts"
  rmdir "$tmp"
  exit "$result"
}
trap cleanup EXIT

: "${DEV_SSH_KEY:?Missing DEV_SSH_KEY}"
: "${DEV_SSH_KNOWN_HOST:?Missing DEV_SSH_KNOWN_HOST}"
umask 077
printf '%s\n' "$DEV_SSH_KEY" > "$tmp/key"
printf '%s\n' "$DEV_SSH_KNOWN_HOST" > "$tmp/known_hosts"
unset DEV_SSH_KEY DEV_SSH_KNOWN_HOST

"$here/ci-control.sh" start
ip="$(aws ec2 describe-instances --region "$region" --instance-ids "$instance" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
runner_ip="$(curl -fsS --max-time 15 https://checkip.amazonaws.com | tr -d '[:space:]')"
python3 -c 'import ipaddress,sys; ipaddress.IPv4Address(sys.argv[1])' "$runner_ip"

for port in 22 443; do
  existing="$(aws ec2 describe-security-group-rules --region "$region" \
    --filters "Name=group-id,Values=$sg" \
    --query "SecurityGroupRules[?IsEgress==\`false\` && IpProtocol=='tcp' && FromPort==\`$port\` && ToPort==\`$port\` && CidrIpv4=='$runner_ip/32'].SecurityGroupRuleId" --output text)"
  if [ -n "$existing" ]; then
    echo "An exact runner ingress rule already exists for port $port; leaving it unchanged."
    continue
  fi
  rule="$(aws ec2 authorize-security-group-ingress --region "$region" --group-id "$sg" \
    --ip-permissions "IpProtocol=tcp,FromPort=$port,ToPort=$port,IpRanges=[{CidrIp=$runner_ip/32,Description=GitHub-Actions-dev-deploy}]" \
    --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text)"
  [[ "$rule" == sgr-* ]] || { echo "Failed to identify temporary ingress rule" >&2; exit 1; }
  rule_ids+=("$rule")
done

ssh_opts=(-i "$tmp/key" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$tmp/known_hosts" -o "HostKeyAlias=$host")
remote="ec2-user@$ip"
ready=false
for _ in $(seq 1 36); do
  if ssh "${ssh_opts[@]}" "$remote" 'test -f /var/lib/cloud/instance/academix-ready'; then ready=true; break; fi
  sleep 5
done
[ "$ready" = true ] || { echo "Dev host did not become ready" >&2; exit 1; }

# The pre-existing backend environment remains on the host and is never sent to Actions.
ssh "${ssh_opts[@]}" "$remote" "grep -qx 'SUPABASE_URL=https://mgrkatzzzkuyudwakshx.supabase.co' /srv/academix/backend/.env && ! grep -q 'htydcedtuuczxjwtqrqx' /srv/academix/backend/.env"
rsync -az --delete -e "ssh ${ssh_opts[*]}" "$repo/backend/src/" "$remote:/srv/academix/backend/src/"
scp "${ssh_opts[@]}" "$repo/backend/Dockerfile" "$repo/backend/.dockerignore" "$repo/backend/package.json" \
  "$repo/backend/package-lock.json" "$repo/backend/tsconfig.json" "$repo/backend/tsconfig.build.json" \
  "$remote:/srv/academix/backend/"
ssh "${ssh_opts[@]}" "$remote" 'set -e
  cd /srv/academix/backend
  sudo docker build -t academix-backend:dev .
  if sudo docker inspect academix-backend >/dev/null 2>&1; then sudo docker rm -f academix-backend >/dev/null; fi
  sudo docker run -d --name academix-backend --restart unless-stopped -p 127.0.0.1:3000:3000 \
    -v /srv/academix/backend/local-data:/app/local-data --env-file .env academix-backend:dev >/dev/null'
rsync -az --delete -e "ssh ${ssh_opts[*]}" "$repo/web/build/" "$remote:/srv/academix/web/"

healthy=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 --resolve "$host:443:$ip" "https://$host/health" |
    python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("status") == "ok" else 1)' 2>/dev/null; then
    healthy=true
    break
  fi
  sleep 5
done
[ "$healthy" = true ] || { echo "Dev health check failed" >&2; exit 1; }
curl -fsS --max-time 10 --resolve "$host:443:$ip" "https://$host/" | grep -i '<html' >/dev/null \
  || { echo "Dev website check failed" >&2; exit 1; }
echo "Dev backend and website responded. Full user workflows have not been verified."
