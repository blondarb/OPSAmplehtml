# OPSAmplehtml Amplify SSR runtime hardening

This stack defines a **candidate replacement** Amplify SSR compute role. It
does not modify the existing Amplify app, create secret values, remove an IAM
policy, or deploy application code.

The production app currently inherits `OPSAmple-AmplifySSR`. Read-only review
on 2026-07-11 found that role attached to `AdministratorAccess-Amplify`, plus a
Bedrock policy with wildcard foundation-model and inference-profile access.
Those permissions are too broad for an internet-facing clinical SSR runtime.

The replacement role is limited to:

- named Secrets Manager ARNs;
- the four pinned clinical Bedrock inference profiles and their exact backing
  model families;
- the named Bedrock knowledge base;
- Medical Transcribe streaming URL authorization; and
- Polly speech synthesis.

## Required change sequence

1. Create `sevaro/ops-amplehtml/cognito` with the `client_secret` field and
   `sevaro/nova-relay/shared-secret` with the `shared_secret` field. Separate
   secrets limit the relay role to the Nova value. Never place either value in
   a command line, log, commit, or CloudFormation parameter.
2. Deploy this role template with the exact existing secret ARNs.
3. Attach the candidate role to a non-production Amplify branch first.
4. Exercise login/refresh, database access, triage model calls, evidence
   retrieval, Historian OpenAI/Nova setup, transcription, and notification
   workflows. CloudTrail `AccessDenied` events must be reviewed; do not respond
   by granting wildcard service access.
5. Canary the production branch, verify alarms and rollback, then attach the
   role to production.
6. Remove secret-valued Amplify branch environment variables only after the
   runtime secret path is proven.
7. Detach `AdministratorAccess-Amplify` and remove the old wildcard inline
   Bedrock policy only after the replacement role is active and verified.
8. Revoke/delete the old long-lived Bedrock access key after confirming there
   are no remaining consumers.

The scanned-packet ingestion stack has separate Lambda roles. Do not add broad
S3, Textract, SNS, SQS, or KMS permissions to the web role unless the final
tenant-bound upload API genuinely requires a specific resource and action.

## Local validation

```bash
sam validate --lint --template-file infrastructure/amplify-ssr-runtime/template.yaml
```

Deployment and Amplify role attachment are intentionally approval-gated.
