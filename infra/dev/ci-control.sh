#!/usr/bin/env bash
set -euo pipefail

region=ap-south-1
instance=i-052e104af76d23a8d
zone=Z00076871CJRZNP45H78P
host=dev.academix.now

state() {
  aws ec2 describe-instances --region "$region" --instance-ids "$instance" \
    --query 'Reservations[0].Instances[0].State.Name' --output text
}

public_ip() {
  aws ec2 describe-instances --region "$region" --instance-ids "$instance" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
}

dns_change() {
  local action="$1" ip="$2" batch
  batch="$(python3 -c 'import json,sys; print(json.dumps({"Changes":[{"Action":sys.argv[1],"ResourceRecordSet":{"Name":sys.argv[2],"Type":"A","TTL":60,"ResourceRecords":[{"Value":sys.argv[3]}]}}]}))' "$action" "$host" "$ip")"
  aws route53 change-resource-record-sets --hosted-zone-id "$zone" --change-batch "$batch" >/dev/null
}

case "${1:-}" in
  start)
    current="$(state)"
    case "$current" in
      stopped) aws ec2 start-instances --region "$region" --instance-ids "$instance" >/dev/null ;;
      running|pending) ;;
      *) echo "Cannot start dev instance in state: $current" >&2; exit 1 ;;
    esac
    aws ec2 wait instance-running --region "$region" --instance-ids "$instance"
    ip="$(public_ip)"
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No public IPv4 address" >&2; exit 1; }
    dns_change UPSERT "$ip"
    echo "Dev instance running; $host points to $ip. Access rules were not changed."
    ;;
  stop)
    current="$(state)"
    case "$current" in
      stopped)
        record="$(aws route53 list-resource-record-sets --hosted-zone-id "$zone" \
          --query "ResourceRecordSets[?Name == '${host}.' && Type == 'A']" --output json)"
        if [ "$record" != "[]" ]; then
          echo "Dev instance is stopped, but a dev DNS record remains; inspect it manually." >&2
          exit 1
        fi
        echo "Dev instance is already stopped."
        exit 0
        ;;
      running|pending|stopping) ;;
      *) echo "Cannot stop dev instance in state: $current" >&2; exit 1 ;;
    esac
    if [ "$current" = pending ]; then
      aws ec2 wait instance-running --region "$region" --instance-ids "$instance"
      current=running
    fi
    ip="$(public_ip)"
    # Delete only the exact record for this instance; never remove a different record.
    dns_error=0
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      if ! record="$(aws route53 list-resource-record-sets --hosted-zone-id "$zone" \
        --query "ResourceRecordSets[?Name == '${host}.' && Type == 'A']" --output json)"; then
        echo "Failed to inspect dev DNS; stopping the instance anyway." >&2
        dns_error=1
      elif ! RECORD="$record" python3 -c 'import json,os,sys; r=json.loads(os.environ["RECORD"]); sys.exit(0 if not r or (len(r)==1 and r[0].get("TTL")==60 and r[0].get("ResourceRecords")==[{"Value":sys.argv[1]}]) else 1)' "$ip"; then
        echo "Dev DNS record differs from the instance; not deleting it." >&2
        dns_error=1
      elif [ "$record" != "[]" ]; then
        dns_change DELETE "$ip" || dns_error=1
      fi
    else
      echo "No instance IP available to verify the dev DNS record." >&2
      dns_error=1
    fi
    if [ "$current" != stopping ]; then
      aws ec2 stop-instances --region "$region" --instance-ids "$instance" >/dev/null
    fi
    aws ec2 wait instance-stopped --region "$region" --instance-ids "$instance"
    echo "Dev instance stopped; storage and other resources may still incur charges."
    [ "$dns_error" -eq 0 ] || { echo "Check the dev DNS record manually." >&2; exit 1; }
    ;;
  *) echo "Usage: $0 start|stop" >&2; exit 1 ;;
esac
