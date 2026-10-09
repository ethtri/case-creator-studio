# Bounded US standard-shipping test (disabled draft)

Website #342; existing CRO/CMO ownership:
[agency #262](https://github.com/ethtri/Snapcase_Autonomous_MarketingAgency/issues/262#issuecomment-6074676327),
under agency #208/#423. Source `bounded_us_shipping_20261009`.
Founder approved the bounded offer October 9, 2026, 05:05:02 UTC. This draft is
not permission to merge, migrate, deploy, activate, send promotional messages,
or spend on ads. It does not establish conversion lift or a new campaign.

## Contract

- Seven days from the recorded launch instant, or the first 10 eligible paid
  single-case orders, whichever comes first. No stacking and no ad spend.
- One $4.99 shipping waiver per slot, at most $49.90. Reserved/unknown Sessions
  count alongside paid orders. Refunds never return slots.
- Exact approved website variant IDs and their Printful numeric IDs are recorded
  in server-only configuration. Only Printful, exactly one unit, US standard
  shipping, no coupon, and no synthetic checkout qualify. Product price remains
  $29.99. Stripe and the order record both use actual $0 shipping.
- The frontend gets an indicative server quote. Allocation is atomic at checkout;
  any change to $0/$4.99 requires the customer to review and click again.
- Existing consent and first/last-touch attribution are preserved. Consent changes
  invalidate a cached retry. No analytics configuration is enabled by this work.

## Fail-closed design

Both `SHIPPING_OFFER_ENABLED=true` and a valid enabled database configuration are
required for new issuance. The migration seeds disabled, with no dates, variants,
cost evidence or verified published US rate. No frontend flag grants eligibility.

`reserve_shipping_offer` locks the one campaign row and allocates only when
reserved plus paid is below 10. Each attempt is bound to a SHA-256 hash of the
normalized checkout, identity, origin, consent and attribution. Stripe creation
uses a stable attempt idempotency key and server-pinned expiry. Concurrent/repeated
requests cannot bind a second Session or overwrite an order. A failed create,
DB write, bind or response never frees a slot by assumption. A retry cannot create
a new Session after its pinned expiry, including after Stripe prunes old keys.

The signed webhook retrieves current Stripe state before settling. Only an
expired, unpaid Session releases a slot; pending, processing, unknown and
async-failed-but-not-provably-expired Sessions remain held. Paid is terminal,
including after refunds. Lifecycle processing remains active when issuance is off.
No local timer releases reservations. This intentionally favors a smaller test
over exceeding the approved cap. A create that never reached Stripe can strand
a slot; do not reset it without documented provider evidence and reviewed action.

All new tables have RLS enabled and no anon/authenticated grants. New RPCs are
security-invoker and service-role-only. Existing policies, credentials and broader
access are unchanged. Production migration/application still requires release
review; these new data objects have not been applied to the live database.

## Deadline semantics

Each offer Session expires at the earlier of one hour from reservation or the
seven-day deadline. Stripe requires expiry 30 minutes–24 hours after creation;
new reservations therefore stop at least 31 minutes before the deadline. Actual
Stripe clock/API delay can reject a near-boundary create; that slot stays held.
Expired Sessions cannot newly complete. Recovery is disabled so Stripe does not
create a new discounted Session after expiry.

A completed Session may still be processing a delayed payment. This test cuts off
customer checkout completion, not final bank settlement: a completion accepted
before expiry may settle after the deadline, and its slot remains reserved/paid
throughout. Payment methods/capture settings are not changed. No automatic
refund, reversal, extra shipping charge or late-payment cancellation is introduced.
This distinction must be accepted in the release/activation decision.

Official Stripe references, reviewed October 9:
- [Limited inventory and session expiration](https://docs.stripe.com/payments/checkout/managing-limited-inventory.md?payment-ui=stripe-hosted)
- [Expire Session](https://docs.stripe.com/api/checkout/sessions/expire)
- [Session status and payment status](https://docs.stripe.com/api/checkout/sessions)
- [Delayed-payment fulfillment](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted)

## Remaining launch gates

1. Correct account catalog evidence now identifies product 683 / variant 17722 as
   Snap Case, Glossy / iPhone 15, Sublimation, quantity one: $13.07 product and
   fulfillment + $5.19 US standard first-item shipping = $18.26 before tax.
   The earlier $14.23 Tough Case quote is rejected. This does not prove universal
   landed cost or profit; tax, destination fees and actual Stripe fees vary. October 15 adds $0.40 per order through
   January 17, 2027, overlapping a seven-day October 9 test. Do not activate from
   these partial figures. Stripe account fees also remain unverified.
2. Country `US`, standard shipping, only exact variant 17722 / website `iphone-15`,
   quantity one. The authenticated published USA shipping table has no Alaska or
   Hawaii exclusion. An earlier suggestion to restrict to 48 states was not a
   supplier requirement and is discarded. The published US catalog rate is the
   cost evidence, not a guarantee of tax-inclusive landed cost or availability
   at every address. No territory-exclusion claim is made beyond Stripe's `US`
   country restriction. Do not introduce broader variant eligibility.
3. Verify numeric variant mappings against the fulfillment map; record immutable
   cost evidence and approved exact eligibility, UTC start/end, and offer terms.
   Configuration freezes after the first reservation; only disabling/re-enabling
   the unchanged still-current window is supported. No replacement campaign or
   reset can be used to evade 10 orders / $49.90.
4. Pass normal checks, real PostgreSQL concurrent allocation/privilege tests,
   rendered desktop/mobile offer and quote-change review, and Stripe test-mode
   lifecycle verification (including response loss, open-session expiry, delayed
   success, duplicate/out-of-order events and DB failures). Unit mocks are not
   provider integration proof. No paid/live financial canary is authorized.
5. Obtain specific release approval; then deploy migration and both edge handlers
   before activating the server gate. Confirm the production webhook subscription
   includes all four checkout lifecycle events already handled by this repository.
   No new grant/credential/account configuration is implied by this checklist.

## Verification / rollback

`npm test` includes focused policy, mocked concurrency/idempotency, error,
quote-change, consent and lifecycle tests. The Verify workflow runs independent
PostgreSQL 16 connections against a disposable `shipping_offer_ci` fixture only.
Do not run that fixture script against a Snapcase database.

Disable issuance first. Existing reserved Sessions remain valid until their pinned
expiry; changing the database enabled flag only blocks new reservations. Preserve all reservation/order/paid records and continue
webhook processing for existing Sessions. A code revert must retain lifecycle
reconciliation until every open/unknown reservation is resolved. Do not delete
ledger history, recycle refunds, or extend/restart the window. CRO/CMO own the
activation receipt, bounded-result review and any immutable marketing audit.
