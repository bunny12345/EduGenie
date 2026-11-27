# Scaling, disaster recovery and development plan

## Goals and constraints

- Target a combined monthly budget of $100, with up to $150 when needed.
  Actual AWS, Supabase, AI, messaging, storage and transfer costs must be
  measured together; budgets and alerts do not prevent charges.
- Aim for no unplanned downtime. This is a goal, not a guarantee: a regional
  outage, a Supabase outage or a shared dependency failure can still interrupt
  service. Planned maintenance may involve downtime.
- Some data loss in a disaster is acceptable. Agree on a measurable recovery
  point objective (RPO) and recovery time objective (RTO) before production
  recovery automation is designed.
- Test changes in an isolated development environment before production.
  Development must not use real student data or production database credentials.
  The operator requested reuse of the production OpenAI key; this shares its
  spending and credential risk across environments. A separate restricted key
  is preferable when available.
- Keep existing production tables, RLS policies, fallbacks and user flows
  intact. Do not copy production data into development.

## Phase 1: isolated, low-cost development environment

Development is only for testing the app and website before production release.
It may be stopped or rebuilt, and its synthetic test data may be lost. Do not
add paid high availability, disaster-recovery infrastructure or automatic
backups for development. Production recovery remains a separate later phase.

1. Use a separate Supabase project and AWS resources, database credentials,
   application configuration, storage and infrastructure state. Never point
   development deployment or database tooling at production.
2. Provide an HTTPS development endpoint restricted to approved network IPs,
   with start, stop, deploy and health-check operations. Shut down compute when
   not testing; account for ongoing storage, networking and Supabase costs.
3. Bootstrap a fresh development schema with equivalent production access
   controls, without blindly replaying migrations that replace existing RLS
   policies. Verify the schema and RLS against production without copying
   rows or secrets. Use synthetic school, teacher and student accounts.
4. Isolate email, SMS and push notifications with safe test services or
   explicitly configured development providers so tests cannot contact real
   users. Use the approved shared OpenAI key only from secure configuration,
   track AI costs and never include the key in source control or test data.
5. Document provisioning, start, stop, mobile and web testing, deployments,
   costs, troubleshooting and rebuilding disposable test data. Verify
   end-to-end before treating the development environment as ready.

**Status (November 27, 2026): Phase 1 partially verified.** See
[`infra/dev/README.md`](../infra/dev/README.md) for operation, cost and limits.
Dev uses an IP allow-list of the operator's ISP /16 range (the ISP rotates the public IP
every few seconds, so a single-IP rule was unusable). Email, SMS, push and owner
credentials are intentionally absent from dev. End-to-end AI, authorization
isolation and complete RLS policy equivalence still need verification. GitHub
Actions automation requires one-time configuration and a successful live run.

## Phase 2: measure and prepare production

1. Measure baseline latency, errors, memory, CPU, database usage, AI-provider
   limits and spending. Add actionable alerts and a confirmed notification
   destination.
2. Run an approved, staged load test up to 60 concurrent synthetic users with
   realistic navigation, homework and AI workloads. Establish separate
   acceptance targets for ordinary API calls and AI/voice calls.
3. Inventory and safely migrate local uploads and production fallback state to
   durable shared storage. Preserve existing links, permissions and behavior.
   Prove concurrent replicas cannot lose data or serve inconsistent results.
4. Make background jobs safe across replicas, including notification delivery,
   exam finalization and cleanup. Test retries, deduplication and recovery.

## Phase 3: automated availability and recovery

1. Use an AWS managed container platform across at least two availability
   zones, subject to measured costs. Keep two healthy replicas, scale on measured
   load, replace unhealthy replicas and roll back failed deployments.
2. Protect database and uploaded files with encrypted backups and alerts.
   Automate isolated restore verification, including RLS, school isolation,
   representative workflows and attachment contents.
3. Exercise instance and availability-zone failure while traffic is running.
   Region-wide and Supabase outages require separate recovery arrangements;
   do not promise zero downtime or zero data loss.
4. Define and test rollback and disaster-recovery procedures. Require explicit
   approval before recovery operations that could overwrite production data.

## Current baseline

On November 27, 2026, the production backend was one healthy EC2 `t3.small`
instance behind an application load balancer, with no AWS Auto Scaling group.
The daily database archive and disk snapshot were present; the backup alarm had
no notification action, and the latest disk snapshot was unencrypted. This is
a point-in-time observation, not proof of future backup or restore success.

## Release gates

- Development and production data, infrastructure and database credentials
  remain isolated. The requested shared AI key is a documented exception.
- Restore and multi-replica tests pass before production scaling is enabled.
- Load, recovery, security and cost results are reviewed before production
  cutover. Production changes require an explicit go-live decision.
