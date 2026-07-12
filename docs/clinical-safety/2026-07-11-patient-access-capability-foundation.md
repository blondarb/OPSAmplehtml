# Signed Patient-Access Capability Foundation

**Status:** foundation and the first purpose-limited route integrations are implemented and locally validated on the safety branch. Nothing is deployed, migration 049 is not applied, and signing keys are not provisioned.

## Safety boundary

Patient access uses a purpose-limited signed capability rather than a clinician Cognito session or a caller-supplied patient identifier. A capability contains only opaque identifiers and authorization metadata: version, kind, tenant ID, patient UUID, optional consult UUID, exact scopes, random JTI, issued-at time, and expiration. It contains no name, date of birth, diagnosis, referral text, or other clinical content.

The compact token is HMAC-SHA-256 signed. Verification requires the exact issuer, audience, version, token kind, tenant/patient/consult bindings, scope set, TTL, clock validity, and an active database lifecycle record. A valid signature alone is not authorization. Tokens are bounded to 4,096 bytes, invitation TTL is capped at 24 hours, and redeemed browser sessions last at most 15 minutes.

Signing configuration has no development or fallback secret:

- `PATIENT_ACCESS_ACTIVE_KID` selects the signing key.
- `PATIENT_ACCESS_SIGNING_KEYS_JSON` is a JSON object mapping key IDs to base64url-encoded 32–64 byte secrets.
- The active key signs new capabilities. Retained prior keys verify capabilities during rotation. Malformed, absent, short, unknown, or excessive key sets fail closed.

## Invitation delivery and fragment exchange

The clinician/admin issuance endpoint returns the raw invitation token once with `Cache-Control: no-store`. It must be delivered in a URL fragment, for example:

```text
https://app.neuroplans.app/patient/access#capability=<token>
```

The token must never appear in a query string, route parameter, analytics event, log, error, or persistent browser storage. The same-origin `/patient/access` exchange page now:

1. Read the fragment in browser memory.
2. Immediately remove it with `history.replaceState` before loading third-party resources.
3. POSTs it in the JSON body to `/api/patient-access/redeem`.
4. Discard the in-memory token regardless of the result.

The page rejects query-string tokens, duplicate or ambiguous fragments, and every redirect except the exact allowlisted `/patient/historian` path. It strips the fragment before the redemption request and before hydration-time profile or optional widget requests can run. The page contains no external-resource or persistent-storage use. Redemption and cookie-clearing requests require an exact same-origin `Origin` or `Referer` and JSON media type.

The server atomically marks the invitation redeemed, records a hash-only audit event, creates a short-lived session capability, and sets it only as the `__Host-sevaro_patient_access` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`. The session token is never returned in JSON. `DELETE /api/patient-access/session` clears that browser cookie; this is local logout, not lifecycle revocation. Clinician/admin revocation remains authoritative.

## Narrow scopes

There is no wildcard scope. Version 1 recognizes only:

- `patient:historian:start`
- `patient:historian:renew`
- `patient:historian:save`
- `patient:historian:report`
- `patient:intake:submit`
- `patient:clarification:answer`

Every integrated route requires its exact scope and authoritative tenant, patient, and—when relevant—consult binding. Capabilities do not permit clinician review, triage disposition, scheduling, SDNE writes, Localizer or scale writes, general patient lookup, messages, tools, or access to another patient.

## Integrated routes

The following POST paths now accept either the existing valid clinical role or a lifecycle-valid patient session with only the listed scope:

| Route | Patient scope | Binding behavior |
|---|---|---|
| `/api/ai/historian/session` | `patient:historian:start` | Standalone historian only; tenant and patient come from signed claims. |
| `/api/ai/historian/session` | `patient:clarification:answer` | Referral clarification only; requires the exact capability consult, consult-to-patient match, and existing triage workflow authorization. It remains forced to the signed Nova relay. |
| `/api/ai/historian/session-renew` | `patient:historian:renew` | Non-clarification OpenAI historian renewal only. Referral clarification renewal remains prohibited on this OpenAI-specific endpoint. |
| `/api/ai/historian/save` | `patient:historian:save` | Standalone save; tenant and patient come from claims. |
| `/api/ai/historian/save` | `patient:clarification:answer` | Consult-bound clarification only; generic save scope cannot answer clarification. Completion still revalidates approved questions and workflow state transactionally. |
| `/api/ai/historian/patient-report` | `patient:historian:report` | Generates a bounded recap of the just-completed patient payload under the bound session. Caller-supplied identity conflicts are rejected. |
| `/api/patient/intake` | `patient:intake:submit` | Tenant/patient come from claims. A consult-bound capability updates only that exact patient-owned consult; an unbound capability may create a new consult for the bound patient. |

Clinical GET/read behavior is unchanged. `/api/ai/historian/localizer`, historian scales, `/api/patient/context`, lookup/register/list, messages, and tools remain clinical-only. A patient capability cannot use them.

## Lifecycle and audit

Migration 049 stores only SHA-256 JTI hashes. It never stores a raw JTI or raw token. It adds restrictive patient/consult foreign keys, immutable claim bindings, single-use redemption, irreversible clinician/admin revocation, parent-invitation binding for session capabilities, and append-only issuance/redemption/rejection/revocation audit events. Revoking an invitation also invalidates a child session at authorization time.

The migration and its triggers were applied to a disposable PostgreSQL 16 instance. Tests proved that unauthorized issuance, cross-patient consult binding, pre-redemption session creation, invitation replay, unauthorized revocation, revocation evidence rewriting, and audit deletion are rejected.

## Remaining production gates

This is not production-enabled patient self-service. Remaining blockers are:

- Provision and rotate the signing key set through the approved secret-management path; no fallback key exists.
- Apply migration 049 through a reviewed database rollout and verify backup/rollback behavior.
- Add delivery-channel identity assurance and a clinician-facing invitation/revocation workflow. A raw token must never be copied into logs, analytics, tickets, or query strings.
- Add a distributed, bounded redemption/authorization rate limiter and abuse alerting. The repository has no reusable distributed limiter; an in-memory Lambda counter would be bypassable across instances and was deliberately not presented as protection.
- Build a capability-aware patient landing experience. Today redemption allowlists only `/patient/historian`; intake-only invitation navigation and a minimal claim-bound patient display are incomplete. General patient lookup/context routes must not be reopened to solve this.
- Add explicit expiration/logout UX on the historian completion surface and operational monitoring for redemption rejection, replay, revocation, and authorization-store failure.
- Complete threat modeling, clinician usability review, accessibility/browser testing, and shadow validation before any real-patient use.
