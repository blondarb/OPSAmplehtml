# Nova relay security cutover and secret rotation

This stack creates a DynamoDB conditional-write ledger for one-use relay
tokens and narrowly grants the existing ECS task role permission to consume a
token. It grants the ECS execution role access to one Secrets Manager replica.
It does not deploy the stack, rotate a secret, register a task definition, or
update the ECS service.

Initial production cutover order (every infrastructure or service change remains
an explicit approval gate):

1. Create `sevaro/nova-relay/shared-secret` in `us-east-2` with
   `shared_secret=current` and `secondary_shared_secret=current`, then replicate
   it to `us-east-1` using a CMK. `current` denotes the same generated value in
   both JSON fields; never put a key value in source, task-definition
   `environment`, logs, or tests.
2. Deploy this stack in `us-east-1` with exact secret-replica, KMS, and alarm
   topic ARNs.
3. Register a new `nova-sonic-relay` task-definition revision:
   - remove `NOVA_RELAY_SHARED_SECRET` from ordinary `environment`;
   - add `NOVA_RELAY_SHARED_SECRET` under ECS `secrets`, selecting the
     `shared_secret` JSON key;
   - add `NOVA_RELAY_SECONDARY_SHARED_SECRET` under ECS `secrets`, selecting
     the `secondary_shared_secret` JSON key;
   - set `NOVA_RELAY_REPLAY_TABLE=nova-relay-replay`;
   - keep an exact `NOVA_RELAY_ALLOWED_ORIGINS` value (it is now mandatory).
4. Deploy one canary task, verify that one token opens one connection and the
   same token is rejected on a simultaneous second connection.
5. Roll the service and verify `/healthz`, connection authorization, replay
   rejection, and both replay-table alarms.
6. Verify the task role cannot read the secret and the execution role cannot
   write DynamoDB. Revoke broad or obsolete permissions.

## Approval-gated zero-downtime rotation

The application mints only with `shared_secret`. Relay tasks require the
primary `NOVA_RELAY_SHARED_SECRET` and may accept the optional secondary only
during a bounded overlap. Use this exact procedure:

1. Confirm the secret JSON initially has `shared_secret=current` and
   `secondary_shared_secret=current`. In the remaining steps, `old` means this
   current value.
2. Generate a new value outside source control. Set
   `secondary_shared_secret=new` while `shared_secret` remains `old`.
3. Force a canary ECS rollout that injects both JSON keys into the primary and
   secondary relay environment variables. Verify synthetic tokens signed by
   both `old` and `new`, verify a repeated token is rejected, inspect both
   replay-table alarms, and verify service and target-group health before
   continuing the rollout.
4. Promote the JSON to `shared_secret=new` and
   `secondary_shared_secret=old`. The application refreshes its primary value
   within its bounded Nova cache TTL while existing relay tasks continue to
   accept both values.
5. Force the ECS service rollout again, then verify health, both synthetic
   signing paths, replay rejection, and alarms.
6. Wait at least the configured application cache TTL plus the 180-second
   maximum relay-token lifetime.
7. Set `secondary_shared_secret=new` (the same value as the current
   `shared_secret`), roll ECS again, and verify a synthetic token signed with
   `old` is rejected. In a separate approved rollout, the secondary
   task-definition injection may optionally be removed after the overlap is no
   longer needed.

Secrets Manager updates alone do not refresh secrets already injected into ECS
tasks or warm application caches. Forced deployments and health verification
are required at each relay transition; the application refreshes on its bounded
Nova-only TTL (30 seconds by default, configurable from 5–60 seconds with
`NOVA_RELAY_SECRET_CACHE_TTL_MS`).

The ledger stores only a random UUID, consume time, and expiration time. It
must never store tenant, patient, prompt, configuration, or clinical data.

Local validation:

```bash
sam validate --lint --template-file infrastructure/nova-relay-security/template.yaml
```

Deployment, secret updates, and ECS rollouts remain explicit approval gates.
