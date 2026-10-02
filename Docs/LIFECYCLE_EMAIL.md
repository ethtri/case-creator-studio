# Lifecycle Email Consent and Suppression

This is the product-side contract for `case-creator-studio#206`, originating
from `Snapcase_Autonomous_MarketingAgency#159` under
`authority_20260720_zero_spend_marketing`. It establishes eligibility and
preference infrastructure. It does not select a marketing ESP, activate a
provider, import recipients, or authorize a live send.

## Contract

- Contract version: `1.0.0`
- Purpose: `lifecycle_marketing`
- Consent copy: `lifecycle_marketing_home_v1`
- Privacy-policy version: `2026-07-22`
- Public capture: homepage design-bench card
- Provider mode: `disabled`
- Live-send flag: `false`

The form uses a separate checkbox that is unchecked on every load. It is not
part of account creation, checkout, terms acceptance, fulfillment, or
transactional order email. The server rejects missing consent, stale consent
copy, malformed source fields, and replayed request identifiers that do not
match the original transaction.

The canonical database stores the normalized address only in server-owned,
row-level-security-protected tables. Consent events are append-only. The public
signup response is intentionally neutral for duplicate and suppressed
addresses so the form cannot be used to enumerate subscriber state. Internal
records still distinguish `duplicate` from `blocked_resubscribe` for audit.
An exact request replay is also returned as an existing preference and cannot
emit a second signup event; reuse of a request ID with different consent data
is rejected.

Suppression wins over signup and provider state. Unsubscribe, provider
unsubscribe, bounce, complaint, and policy suppression move the subscriber to
`suppressed`; a later automated signup cannot clear that state. No email
address, preference token, or provider contact identifier is sent to analytics
or written to application logs.

## Preference and one-click routes

The customer page is `/email-preferences?token=<opaque-token>`. It requires no
account login. The token is random; only its SHA-256 digest is stored, and the
page removes it from the browser address bar before the customer can follow a
same-site link. A valid
unsubscribe transaction updates canonical suppression before it creates a
provider synchronization operation.

The HTTPS Edge endpoint also accepts the RFC 8058 one-click POST directly,
without page navigation:

```text
POST /functions/v1/lifecycle-email-preferences?token=<opaque-token>
Content-Type: application/x-www-form-urlencoded

List-Unsubscribe=One-Click
```

A future promotional provider integration must set both headers:

```text
List-Unsubscribe: <https://<verified-host>/functions/v1/lifecycle-email-preferences?token=<opaque-token>>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The POST is idempotent: a repeated valid request returns the already-suppressed
state and never re-enables the subscriber. The endpoint is one part of the send
contract; it does not by itself prove that provider-specific headers,
authentication, rendering, audience provenance, or legal requirements pass.
See the [FTC CAN-SPAM guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
and [Google sender guidance](https://support.google.com/mail/answer/81126).

## Provider safety

The outbox has unique idempotency keys, bounded attempts, leases, terminal
`dead_letter` and `uncertain` states, and an explicit `dry_run` outcome. A
definite retryable rejection may be retried within the attempt cap. A timeout or
other ambiguous mutation becomes `uncertain` and is never retried until an
operator reconciles external state.

The webhook contract requires a fresh HMAC signature, provider event ID, and
provider contact ID. Receipt IDs are unique and replay-safe. Older provider
events cannot overwrite newer state, and a provider `subscribed` event cannot
clear a website or provider suppression.

No worker schedule is created. The #325 worker returns real aggregate eligibility
when `dryRun: true`, with exact activation blockers; it never claims work, issues
tokens, or contacts a provider in dry-run. Live mode returns 503 before database
or provider mutation while disabled. Provider credentials belong only in
deployment secrets. See the bounded activation and verification contract below.

## #325 worker and activation

The operator-only `lifecycle-email-outbox` accepts POST with an explicit boolean
`dryRun`. Browser origins and ordinary user/anon credentials are rejected. A
server-only service-role bearer remains supported; an optional dedicated
`LIFECYCLE_OUTBOX_WORKER_SECRET` is also accepted. The existing platform-injected
`SUPABASE_SECRET_KEYS.default` server key is accepted through `apikey` only;
publishable keys and other named keys are rejected. No key creation or rotation
is required by this compatibility path.

The reviewed worker SQL originally named `20261002150723_lifecycle_recovery_worker.sql`
was applied by the management API as version `20261002155310`. Its filename now
matches that existing history entry; SQL bytes are unchanged (SHA256
`9032964c07251bb65b3f784e6996d55ded83e1e1e3fdab8fcce839624c3ecd21`).
This is a filename reconciliation, not a second database application or history repair.

Keep `LIFECYCLE_EMAIL_ENABLED=false` and `LIFECYCLE_EMAIL_PROVIDER=disabled` for
this release. No schedule, contact creation, subscription change or seed is
installed. `LIFECYCLE_RESEND_API_KEY` is a separate reviewed lifecycle credential;
the transactional key is never silently reused. Native callback verification
uses `LIFECYCLE_RESEND_WEBHOOK_SECRET` and Svix headers. Other providers retain
the existing generic signed callback contract.

Live execution additionally requires `LIFECYCLE_ACTIVATION_EVIDENCE`, a reviewed
production JSON object whose `observedAt` is no more than 15 minutes old. Required
binding values are source `production_contract`, evidence class `production`,
the exact production `projectUrl`, from/reply-to `hello@snapcase.ai`, contract
version `1.0.0`, standing authority ID, exact `accountId`, `domainId`, `webhookId`
and `marketingTopicId`, and webhook schema `svix_resend_native`. Boolean fields
`bindingVerified`, `keyAccountVerified`, `suppressionVerified`,
`unsubscribeVerified`, `restorationVerified`, `freePlanVerified`,
`noOverageVerified` and `seedAndQaExcluded` must be actual `true` booleans from
independent evidence, never settings inferred from an API key or fixture.
`dailyRemaining`/`monthlyRemaining` must be verified positive integers no greater
than 100/3000. These are residual zero-cost capacity, not authorization to buy a
plan or exceed it. `flows` must be a nonempty distinct subset of `welcome`,
`abandoned_design`, `abandoned_cart`. Do not populate this object until actual
production provider/account, DNS, headers, suppression and restoration proofs
pass. The pre-existing custom webhook is not proof of native Resend support.

An enabled invocation reads the exact domain using its lifecycle key, claims at
most one approved-flow row, and reserves capacity atomically. Exhausted capacity
leaves eligible pending rows untouched. Reservations are conservatively counted
against residual quota for the current UTC day/month; deferred work crossing a
day boundary must reserve in the new period. This may under-use free capacity.
No reservation is automatically refunded after any provider attempt.
Preparation and the final send recheck also require a current-day reservation;
an in-flight rollover defers work without treating it as recipient suppression.
Sending stops within 20 seconds of lease expiry or UTC midnight (provider
requests have a 10-second timeout).

Current canonical consent, exact source/copy/policy versions, grant ordering,
QA/internal exclusions, frequency, expiry, purchase, design revision and model
checks precede token preparation and are rechecked immediately before sending.
Welcome grants and events must remain within 24 hours. Existing provider contact
identity, explicit global `unsubscribed=false`, and explicit opt-in to the exact
marketing topic are read immediately before sending. Missing/unavailable sync
defers the job; it never invents provider consent or creates a contact.
An explicit provider global/topic opt-out is durably recorded as canonical
suppression with a consent event; existing recovery triggers revoke active
links, and later signup/sync cannot clear it. Missing provider information
never changes canonical consent.
Legacy
`subscribe`/`suppress` synchronization rows are not claimed by this message
worker; provider synchronization must already be verified. Canonical website
unsubscribe remains authoritative before any provider state.

Approved plain-text copies are pinned from marketing main `2b78d91` and retain
their template IDs, campaigns and UTMs. Preference and recovery tokens remain
private and only their digests persist in the existing tables. The message
contains the private recovery URL where applicable, body unsubscribe and RFC8058
headers. Acceptance IDs, unique outbox keys and redacted event joins persist;
the endpoint response contains no recipient, private token or provider payload.

Token preparation is once per claim. Pre-provider failures can defer at most
three times (five minutes apart), using one reservation. Any attempted send,
timeout, malformed provider acceptance, stale sending lease or completion
failure becomes `uncertain` and is never requeued automatically. Reconciliation
uses the same key and preserved acceptance ID before any further decision;
there is no blind retry after Resend's 24-hour idempotency retention. Acceptance
is retained even when suppression wins while the request is in flight. Native
bounce/complaint/suppressed events serialize with completion by message ID,
including callbacks arriving before completion; they cannot re-enable consent.
Deletion preserves terminal recovery audit history and revokes active links.

## Worker verification and release

Normal `npm test` imports `scripts/lifecycle-worker.test.mjs`, including actual
HTTP handler auth/input, disabled/dry-run behavior, strict evidence, provider
payload and native Svix fixtures. Provider requests are mocked. Check the actual
Edge entrypoints with `deno check`, in addition to repository lint/type/build.

`scripts/lifecycle-worker-sql.cjs` runs actual native PostgreSQL migrations and
synthetic concurrency/eligibility/token/callback fixtures. It requires an
isolated database **only** at `127.0.0.1:55439/lifecycle_qa`; it drops the public
fixture schema after this explicit guard. Set `LIFECYCLE_SQL_CONNECTION_FILE`
to a private local connection JSON, `LIFECYCLE_PG_DRIVER_PATH` to an existing
`pg` module (or install it only in TEMP), and `LIFECYCLE_SQL_RESULTS_DIR` to TEMP.
Never use production credentials or export the connection file. Tests emit
redacted results and exact migration hashes, not recipients or tokens.

Apply only the reviewed additive worker migration after reconciling current
production schema. Never blanket-push or repair historical migrations. Deploy
both functions with existing disablement unchanged, then verify authenticated
disabled and aggregate dry-run responses and unchanged recipient/message counts.
Activation and the first real welcome/recovery delivery remain separate gates.
Rollback disables the worker, restores the previous function version, and
preserves all reservations, message joins, consent and suppression records.

API references reviewed 2026-10-02:
[Resend sending](https://resend.com/docs/api-reference/emails/send-email),
[idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys),
[contact status](https://resend.com/docs/api-reference/contacts/get-contact),
[contact topics](https://resend.com/docs/api-reference/contacts/get-contact-topics).

## Flow boundary

| Flow | Classification | Marketing consent required |
|---|---|---|
| Welcome | Marketing | Yes |
| Abandoned design | Marketing | Yes |
| Abandoned cart | Marketing | Yes |
| Post-purchase receipt/status | Transactional | No; content must stay operational |
| Post-purchase promotion | Marketing | Yes |
| Review/UGC request | Marketing | Yes |
| Gift reminder | Marketing | Yes |

## Deployment and verification order

1. Apply `20260722120000_add_lifecycle_marketing_foundation.sql`.
2. Deploy `lifecycle-email-preferences`, `lifecycle-email-outbox`, and
   `lifecycle-email-webhook` with provider mode still `disabled`.
3. Verify desktop, mobile, keyboard, screen-reader labels, network failure,
   duplicate neutral response, unsubscribe, and blocked resubscribe behavior.
4. Run the authenticated aggregate dry-run and record its audit.
5. Complete the provider decision in `LIFECYCLE_EMAIL_PROVIDER_DECISION.md`.
6. Only after provider configuration, webhook, unsubscribe headers, audience,
   claims, destination, suppression, rollback, and audit gates pass may a
   separate change enable a live worker or send.

Rollback removes or disables public capture and both workers while preserving
subscriber consent history and every suppression record.
