# Private Saved-Design and Cart Recovery

This is the website-side contract for `case-creator-studio#267`, originating
from `Snapcase_Autonomous_MarketingAgency#389`. It extends, and does not replace,
the consent, suppression, unsubscribe, outbox, and provider boundary established
by #206.

## Safety boundary

- Recovery is marketing. A matching canonical subscriber must already be
  `subscribed`; saving a design or starting checkout never grants consent.
- Suppression, unsubscribe, purchase, deletion, expiry, an unsupported model,
  and a superseded design revision revoke eligibility and any active token.
- Tokens contain 32 random bytes represented as opaque lowercase hex. Only the
  SHA-256 digest is stored. Tokens are expiring, revocable, and single-use.
- The browser removes `token` from the address bar before rendering a same-site
  link. Email, artwork, storage paths, direct record IDs, and raw tokens are
  prohibited in analytics, application logs, screenshots, and repository
  evidence.
- A signed-in identity that conflicts with the recovery owner is rejected. A
  signed-out shopper may use the bearer link because the opaque token is the
  intended password-free proof.
- Cart item identity, supported model, quantity, and current price are
  revalidated server-side. A stale browser or URL value cannot set price,
  availability, ownership, purchase state, or attribution truth.

## Durable lifecycle

`register_saved_design_recovery` creates one intent per design revision after a
successful authenticated save. `register_abandoned_cart_recovery` creates one
intent per pending server order after Stripe Checkout creation. Both create a
unique recovery outbox operation with a delayed eligibility time. Replays reuse
the idempotency key rather than creating a second sequence.

The provider worker must call `issue_lifecycle_recovery_token` only after the
outbox row is due and all existing provider/send gates pass. A link scanner may
inspect the route without consuming the token; the explicit customer restore
action consumes it atomically. Provider timeouts remain `uncertain` and cannot
be retried blindly under the #206 outbox contract.

No provider is selected by this change. `LIFECYCLE_EMAIL_PROVIDER=disabled` and
`LIFECYCLE_EMAIL_ENABLED=false` remain authoritative, so no recovery email can
be sent by this implementation.

## Customer states

`/recover?token=<opaque-token>` renders accessible success, repriced, expired,
revoked, already-used, already-purchased, deleted, stale-revision,
unavailable-model, invalid, and generic-failure states. Restoration replaces a
cart only after every returned model validates locally; failure leaves the
existing cart untouched.

## Measurement

Consent-aware analytics may emit `recovery_view` and `recovery_resume` with only
`flow`, categorical `outcome`, and boolean `repriced`. UTMs may preserve
acquisition attribution, but never override authoritative order or revenue
truth. Missing analytics consent means no event and no later replay.

## Rollback

Disable the `lifecycle-recovery` function and future recovery-outbox claiming,
revoke active token rows, and preserve subscriber suppression, order state,
consent history, and redacted audit evidence. Do not delete records that are
needed to reconcile an ambiguous provider mutation.
