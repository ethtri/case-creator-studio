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

No worker schedule is created by this change. The outbox endpoint returns a
redacted welcome preview only when `dryRun: true`; live execution returns 503
while either the provider or live flag is disabled. Provider credentials belong
only in deployment secrets.

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
4. Run the redacted welcome dry-run and record its audit.
5. Complete the provider decision in `LIFECYCLE_EMAIL_PROVIDER_DECISION.md`.
6. Only after provider configuration, webhook, unsubscribe headers, audience,
   claims, destination, suppression, rollback, and audit gates pass may a
   separate change enable a live worker or send.

Rollback removes or disables public capture and both workers while preserving
subscriber consent history and every suppression record.
