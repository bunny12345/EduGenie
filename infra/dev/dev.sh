#!/usr/bin/env bash
# AcademiX development environment control script.
#
#   ./dev.sh init            one-time: SSH key, Terraform, wait for the host
#   ./dev.sh up              start the host, open it to your IP, point DNS at it
#   ./dev.sh down            stop the host (saves compute cost) and remove DNS
#   ./dev.sh status          show host state, IP and health
#   ./dev.sh allow-me        replace the SSH/HTTPS allow-list with your current IP
#   ./dev.sh allow <cidr>    additionally allow another IP (e.g. a phone network)
#   ./dev.sh db-bootstrap    apply the schema-only baseline to the DEV database (no data)
#   ./dev.sh deploy [backend|web|all]
#   ./dev.sh seed            create fake schools/teachers/students (dev database only)
#   ./dev.sh destroy         delete the dev host and security group
#
# Safety: this script only ever targets the dev Supabase project and the dev
# EC2 host. It never reads production data and refuses to bake production
# settings into the dev website.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
REGION="${AWS_REGION:-ap-south-1}"
DEV_REF="mgrkatzzzkuyudwakshx"
PROD_REF="htydcedtuuczxjwtqrqx"
DEV_HOST="dev.academix.now"
ZONE_ID="Z00076871CJRZNP45H78P"
KEY_NAME="academix-dev"
KEY="${ACADEMIX_DEV_KEY:-$HOME/.ssh/academix/academix-dev.pem}"
CONF="$HOME/.academix-dev"
ENV_FILE="$CONF/backend.env"
SUPABASE_WORKDIR="${ACADEMIX_DEV_SUPABASE_WORKDIR:-$CONF/supabase}"

# Backend controller prefixes proxied to NestJS (the rest is the website).
API_PREFIXES=(auth chat dashboard orchard games homework progress calendar rewards tests library settings teacher school curriculum uploads health support owner notifications)

tf() { terraform -chdir="$HERE" "$@"; }
instance_id() { tf output -raw instance_id; }
sg_id() { tf output -raw security_group_id; }
state() { aws ec2 describe-instances --region "$REGION" --instance-ids "$(instance_id)" --query 'Reservations[0].Instances[0].State.Name' --output text; }
public_ip() { aws ec2 describe-instances --region "$REGION" --instance-ids "$(instance_id)" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text; }
ssh_opts=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes)
rsh() { ssh "${ssh_opts[@]}" "ec2-user@$(public_ip)" "$@"; }

supabase_dev() { supabase --workdir "$SUPABASE_WORKDIR" "$@"; }

ensure_supabase_link() {
  mkdir -p "$SUPABASE_WORKDIR"
  [ -f "$SUPABASE_WORKDIR/supabase/config.toml" ] || supabase init --workdir "$SUPABASE_WORKDIR" >/dev/null
  supabase link --workdir "$SUPABASE_WORKDIR" --project-ref "$DEV_REF" >/dev/null
}

dns() { # dns UPSERT|DELETE ip
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch \
    "{\"Changes\":[{\"Action\":\"$1\",\"ResourceRecordSet\":{\"Name\":\"$DEV_HOST\",\"Type\":\"A\",\"TTL\":60,\"ResourceRecords\":[{\"Value\":\"$2\"}]}}]}" >/dev/null
}

cmd_init() {
  mkdir -p "$(dirname "$KEY")" "$CONF"
  if ! aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
    echo "==> Creating dev SSH key pair (separate from production)"
    (umask 077; aws ec2 create-key-pair --region "$REGION" --key-name "$KEY_NAME" --query KeyMaterial --output text > "$KEY")
    chmod 400 "$KEY"
  fi
  tf init -input=false
  tf apply -input=false -auto-approve
  echo "==> Dev host created. Run: ./dev.sh up"
}

cmd_allow_me() {
  local ip sg ids
  ip="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
  sg="$(sg_id)"
  ids="$(aws ec2 describe-security-group-rules --region "$REGION" --filters "Name=group-id,Values=$sg" \
    --query 'SecurityGroupRules[?!IsEgress && (FromPort==`22` || FromPort==`443`)].SecurityGroupRuleId' --output text)"
  [ -z "$ids" ] || aws ec2 revoke-security-group-ingress --region "$REGION" --group-id "$sg" --security-group-rule-ids $ids >/dev/null
  # Home ISPs often rotate the public IP every few seconds inside one range, so a
  # single /32 keeps locking you out. Default: allow the ISP's /16 (a small slice
  # of the internet). Set ALLOW_PREFIX=32 for the strictest single-IP rule.
  local cidr="$ip/32"
  if [ "${ALLOW_PREFIX:-16}" = 16 ]; then cidr="$(cut -d. -f1,2 <<<"$ip").0.0/16"; fi
  cmd_allow "$cidr"
  echo "==> Allowed SSH and HTTPS from $cidr only (current IP $ip)"
}

cmd_allow() {
  local cidr="${1:?usage: dev.sh allow <cidr>}" sg
  sg="$(sg_id)"
  for port in 22 443; do
    aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$sg" --protocol tcp --port "$port" --cidr "$cidr" >/dev/null 2>&1 || true
  done
}

cmd_up() {
  local id ip
  id="$(instance_id)"
  echo "==> Starting dev host $id"
  aws ec2 start-instances --region "$REGION" --instance-ids "$id" >/dev/null
  aws ec2 wait instance-running --region "$REGION" --instance-ids "$id"
  ip="$(public_ip)"
  cmd_allow_me
  dns UPSERT "$ip"
  echo "==> $DEV_HOST -> $ip"
  echo "==> Waiting for SSH and host setup"
  for _ in $(seq 1 40); do
    rsh 'test -f /var/lib/cloud/instance/academix-ready' 2>/dev/null && break
    sleep 5
  done
  rsh 'sudo docker start academix-backend academix-caddy >/dev/null 2>&1 || true'
  echo "==> Up. Site (once deployed): https://$DEV_HOST"
}

cmd_down() {
  local ip
  ip="$(public_ip 2>/dev/null || true)"
  if [ -n "$ip" ] && [ "$ip" != "None" ]; then dns DELETE "$ip" || true; fi
  aws ec2 stop-instances --region "$REGION" --instance-ids "$(instance_id)" >/dev/null
  echo "==> Dev host stopping. Compute billing stops; disk storage (~\$2/month) continues."
}

cmd_status() {
  local st ip
  st="$(state)"
  echo "host:   $st"
  if [ "$st" = running ]; then
    ip="$(public_ip)"
    echo "ip:     $ip"
    echo "health: $(curl -fsS --max-time 8 "https://$DEV_HOST/health" 2>&1 | head -c 200 || echo 'not reachable (is your IP allowed? try ./dev.sh allow-me)')"
  fi
}

cmd_db_bootstrap() {
  ensure_supabase_link
  local n
  n="$(supabase_dev db query --linked --output json "SELECT count(*) c FROM pg_tables WHERE schemaname='public'" 2>/dev/null | jq -r '.rows[0].c')"
  if [ "$n" != "0" ]; then echo "Dev database already has $n tables; refusing to re-apply the baseline."; return 0; fi
  supabase_dev db query --linked "CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public" >/dev/null
  supabase_dev db query --linked --file "$HERE/db/baseline-schema.sql" >/dev/null
  supabase_dev db query --linked --file "$HERE/db/align-grants.sql" >/dev/null
  echo "==> Dev database baseline applied (schema only, no data)"
}

make_env() {
  mkdir -p "$CONF"
  local keys service jwt
  keys="$(supabase projects api-keys --project-ref "$DEV_REF" --reveal --output json)"
  service="$(jq -r '.[]|select(.name=="service_role")|.api_key' <<<"$keys")"
  [ -n "$service" ] && [ "$service" != null ] || { echo "Could not read the dev service key"; exit 1; }
  if [ -f "$ENV_FILE" ] && grep -q '^SUPABASE_JWT_SECRET=' "$ENV_FILE"; then
    jwt="$(grep '^SUPABASE_JWT_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
  else
    jwt="$(openssl rand -hex 48)"
  fi
  (
    umask 077
    {
      echo "NODE_ENV=production"
      echo "PORT=3000"
      echo "ALLOWED_ORIGINS=https://$DEV_HOST"
      echo "SUPABASE_URL=https://$DEV_REF.supabase.co"
      echo "SUPABASE_SERVICE_ROLE_KEY=$service"
      echo "SUPABASE_JWT_SECRET=$jwt"
      echo "PUSH_SCHEDULER_DISABLED=true"
      # Only the approved shared AI settings are copied; production database, mail,
      # SMS, push and owner credentials are deliberately NOT copied.
      grep -E '^(OPENAI_API_KEY|OPENAI_CHAT_MODEL|OPENAI_EMBEDDING_MODEL|LLM_PROVIDER)=' "$REPO/backend/.env" || true
    } > "$ENV_FILE"
  )
  chmod 600 "$ENV_FILE"
  if grep -q "$PROD_REF" "$ENV_FILE"; then echo "Refusing: dev env references production"; rm -f "$ENV_FILE"; exit 1; fi
}

caddyfile() {
  local matcher="" p
  for p in "${API_PREFIXES[@]}"; do matcher+=" /$p /$p/*"; done
  cat <<EOF
$DEV_HOST {
	encode gzip
	@api path$matcher
	handle @api {
		reverse_proxy 127.0.0.1:3000
	}
	handle {
		root * /srv/web
		try_files {path} /index.html
		file_server
	}
}
EOF
}

deploy_backend() {
  make_env
  local ip; ip="$(public_ip)"
  echo "==> Syncing backend to dev host"
  rsync -az --delete -e "ssh ${ssh_opts[*]}" "$REPO/backend/src/" "ec2-user@$ip:/srv/academix/backend/src/"
  scp "${ssh_opts[@]}" "$REPO/backend/Dockerfile" "$REPO/backend/.dockerignore" "$REPO/backend/package.json" \
    "$REPO/backend/package-lock.json" "$REPO/backend/tsconfig.json" "$REPO/backend/tsconfig.build.json" \
    "ec2-user@$ip:/srv/academix/backend/" >/dev/null
  scp "${ssh_opts[@]}" "$ENV_FILE" "ec2-user@$ip:/srv/academix/backend/.env" >/dev/null
  rsh 'chmod 600 /srv/academix/backend/.env'
  echo "==> Building and starting backend"
  rsh 'set -e; cd /srv/academix/backend; mkdir -p local-data
    sudo docker build -t academix-backend:dev .
    sudo docker rm -f academix-backend >/dev/null 2>&1 || true
    sudo docker run -d --name academix-backend --restart unless-stopped -p 127.0.0.1:3000:3000 \
      -v /srv/academix/backend/local-data:/app/local-data --env-file .env academix-backend:dev >/dev/null'
  caddyfile | rsh 'cat > /srv/academix/caddy/Caddyfile'
  rsh 'sudo docker rm -f academix-caddy >/dev/null 2>&1 || true
    sudo docker run -d --name academix-caddy --restart unless-stopped --network host \
      -v /srv/academix/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v /srv/academix/web:/srv/web:ro \
      -v academix-caddy-data:/data caddy:2 >/dev/null'
}

deploy_web() {
  local keys anon
  keys="$(supabase projects api-keys --project-ref "$DEV_REF" --reveal --output json)"
  anon="$(jq -r '.[]|select(.name=="anon")|.api_key' <<<"$keys")"
  echo "==> Building website against the dev API and dev database"
  ( cd "$REPO/web" && CI=false REACT_APP_API_URL="https://$DEV_HOST" REACT_APP_USE_PROXY= REACT_APP_DEV_TOKEN= \
      REACT_APP_SUPABASE_URL="https://$DEV_REF.supabase.co" REACT_APP_SUPABASE_ANON_KEY="$anon" npx react-scripts build >/dev/null )
  if grep -rqE "$PROD_REF" "$REPO/web/build" --include='*.js' 2>/dev/null; then
    echo "Refusing: the build references production settings"; exit 1
  fi
  rsync -az --delete -e "ssh ${ssh_opts[*]}" "$REPO/web/build/" "ec2-user@$(public_ip):/srv/academix/web/"
}

cmd_deploy() {
  case "${1:-all}" in
    backend) deploy_backend ;;
    web) deploy_web ;;
    all) deploy_backend; deploy_web ;;
    *) echo "usage: dev.sh deploy [backend|web|all]"; exit 1 ;;
  esac
  echo "==> Deployed. https://$DEV_HOST"
}

cmd_seed() { node "$HERE/seed.js"; }

cmd_destroy() {
  [ "${1:-}" = "--yes" ] || { echo "This deletes the dev host. Re-run: ./dev.sh destroy --yes"; exit 1; }
  cmd_down || true
  tf destroy -input=false -auto-approve
}

case "${1:-}" in
  init) cmd_init ;;
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  allow-me) cmd_allow_me ;;
  allow) shift; cmd_allow "$@" ;;
  db-bootstrap) cmd_db_bootstrap ;;
  deploy) shift; cmd_deploy "$@" ;;
  seed) cmd_seed ;;
  destroy) shift; cmd_destroy "$@" ;;
  *) sed -n '2,16p' "$0"; exit 1 ;;
esac
