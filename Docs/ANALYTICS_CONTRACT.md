# Analytics contract

Version: `1.0.0`

## Privacy and consent

- Analytics is opt-in by default. The Google Analytics script is not requested
  until the visitor selects **Allow analytics**.
- Google Consent Mode defaults analytics and advertising storage to `denied`.
  Granting analytics changes only `analytics_storage`; advertising storage,
  user data, and personalization remain denied.
- Events must not contain artwork, preview URLs, names, email addresses,
  shipping addresses, or free-form user text.
- Browser GA client IDs are accepted only in the pseudonymous numeric
  `<number>.<number>` shape. Checkout rejects other values, and direct/retry
  delivery replaces any invalid legacy value with `server.<order-uuid>`;
  free text is never forwarded as `client_id`.
- The Privacy Policy exposes the current device preference and lets the visitor
  change it.
- Consent consumers read one canonical external-store snapshot. Same-tab
  changes and cross-tab storage changes are invalidation signals only; event
  payloads are never trusted as consent. Missing, malformed, cleared, or
  inaccessible storage fails closed to `unset`, and a failed Decline remains
  denied in the current document even when the preference cannot be persisted.
- This implementation is a conservative global default. The selling-region
  policy and final copy still require owner/counsel approval before launch.

## Page views

One `page_view` is sent after each meaningful client-side route change.
`SeoRuntime` owns route metadata and runs before `MarketingRuntime`, which reads
the current `document.title` into the event.

The reporting path excludes:

- `designId`
- `session_id`
- UTM parameters
- `gclid`, `fbclid`, and `ttclid`

The event `page_location` removes generated design and Checkout Session IDs,
but retains approved UTM and ad-click parameters so GA4 can perform standard
campaign attribution.

## Ecommerce events

The storefront uses the standard GA4 names:

- `view_item_list`
- `select_item`
- `view_item`
- `add_to_cart`
- `begin_checkout`
- `purchase`
- `refund` (reserved for the server-side reconciliation follow-up)

Every ecommerce event includes `items`. Each valid item contains:

- `item_id`
- `item_name`
- `item_brand`
- `item_category`
- `item_variant`
- `price`
- `quantity`
- `discount`

Currency, value, shipping, coupon, tax, and transaction ID are event-level
parameters where GA4 defines them.

Catalog, product-detail, and SEO-landing views are consent-aware. An already
granted visitor emits the current view at mount; a visitor who grants after the
route mounts emits that current view once. View deduplication is held only in
bounded document memory and uses the contract version, view event, normalized
pathname, and stable list or product ID. Query strings, history-entry keys,
rerenders, Strict Mode effect replay, and back/forward navigation cannot create
another ecommerce view for the same route contract during that SPA lifetime.
A full reload starts a new document and may emit a new view.

No pre-consent ecommerce payload or pending-event queue is stored. Selection,
CTA, and other interaction events remain immediate: they are dropped while
consent is unset or denied and are never replayed after a later grant. SEO
landing pages use route-specific list IDs, emit the complete set of visibly
featured items, and retain the same list context on model selection. Their
hero-primary, Gift ideas, and Browse all cases CTAs use the existing
`primary_cta_click` contract with stable placement, label, and destination.

## Product and diagnostic events

- `primary_cta_click`: placement, label, and destination
- Editor continuation uses `primary_cta_click` with
  `placement=editor_continue`. Its analytics payload carries only placement,
  label, and destination; it never carries a design ID or artwork.
- `design_start`: selected model
- `editor_first_action`: first design change only
- `preview_success`: preview completed
- `preview_failure`: categorical error code only
- `design_save`: design save completed
- `recovery_view`: private restoration eligibility result, using only flow and categorical outcome
- `recovery_resume`: successful saved-design or cart restoration, using only flow, categorical outcome, and repricing flag
- `editor_error`: categorical error code only
- `checkout_error`: categorical error code and stage only
- `promo_applied`: code and discount amount
- `order_verification`: bounded verification outcome in `stage` and categorical
  error code only; emitted at most once per session/outcome in a browser tab

All events include `analytics_contract_version`.

## Attribution

After analytics consent is granted, the browser stores approved first-touch
and last-touch values separately:

- UTM source, medium, campaign, term, and content
- `gclid`, `fbclid`, and `ttclid`
- external referrer
- landing path and capture time

The first touch is immutable. A later visit with campaign parameters updates
only the last touch. Attribution is attached to the order request and stored in
the existing `orders.marketing_attribution` JSON field. Declining analytics
removes browser attribution storage and sends no attribution with checkout.

## Server reconciliation

The browser success page does not emit purchase revenue. The Stripe webhook is
the source of truth for consented server events:

- paid Checkout Session → `purchase`
- Stripe refund → `refund`
- expired Checkout Session → `checkout_abandoned`
- asynchronous payment failure → `checkout_error`

The `analytics_events` outbox uses a unique event key and an atomic database
claim. Duplicate webhook delivery cannot claim or send the same purchase or
refund concurrently. A server-only worker drains eligible `pending`, `failed`,
and stale `sending` rows every minute. Claims use a five-minute lease and
`FOR UPDATE SKIP LOCKED`, so concurrent workers do not wait on or deliver the
same claimed row.
Before each outbound request, the worker renews the row's lease using the same
claim token. If another worker already reclaimed it, the stale worker records
`leaseLost` and does not send.

Retries are bounded to five attempts with deterministic delays of 1, 5, 15,
and 60 minutes after attempts 1-4. Exhausted rows become `dead_letter`.
Consent that is denied or unset becomes `suppressed` without a GA request.
The worker rebuilds the payload from the authoritative order and the outbox's
fixed refund amount rather than replaying the stored JSON body.

GA4 Measurement Protocol does not provide this integration with a receiver-side
idempotency guarantee. If GA accepts a request but the local `sent` transition
fails, the worker records an `ambiguous` terminal row and does not retry it
automatically. If the database outage also prevents that ambiguous transition,
the stale lease can cause a duplicate GA send; the five-attempt cap prevents an
infinite replay, and the worker reports
`splitBrainPersistenceFailures` for alerting. Reconcile the GA transaction ID
and order before manually requeueing any ambiguous row.

A timeout, connection reset, or other network exception after the request
starts is also delivery-ambiguous because GA may have accepted the body before
the response was lost. These rows become `ambiguous` with
`last_failure_kind=uncertain_delivery`; they are never automatically replayed.
Confirmed non-success HTTP responses remain eligible for bounded retry.

The server payload is built from the stored order and includes transaction ID,
currency, value, shipping, coupon, tax, and safe line-item fields. Browser
artwork and contact details are never copied into it.

Deployment requires `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` in both the
Stripe webhook and `ga4-outbox-drain` environments. The worker also requires a
dedicated `GA4_OUTBOX_DRAIN_AUTH_SECRET`; its matching value is stored in
Supabase Vault as `ga4_outbox_drain_auth_secret` for the cron request. These
values must be configured outside source control. The schedule also requires
the Vault flag `ga4_outbox_drain_enabled=true`; missing or any other value
immediately suppresses scheduled requests. Run
`configure_ga4_outbox_drain_schedule()` after any flag or scheduler-secret
change so the cron row is removed or recreated to match the current config. Set
the flag only after the GA4 server credentials, consent approval, deployment
evidence, and monitoring are ready. Before
closing issue #66, attach GA4 DebugView (or equivalent) evidence for a completed
test order and refund, and record owner/counsel approval of the selling-region
consent policy.

### Outbox operations

Configure the literal Vault value `ga4_outbox_drain_enabled=false` and deploy
`ga4-outbox-drain` before applying the cron migrations. In a clean
environment, apply migrations in filename order; deploy the updated Stripe
webhook only after the hardening migration has executed. In an environment
whose history already contains later migrations, execute and record each
missing analytics file in filename order rather than using a broad migration
push. Applying the schedule migrations is safe while the enable flag is missing
or false: the service-role-only configurator removes any existing schedule.
After all required secrets and approvals are present, call
`configure_ga4_outbox_drain_schedule()` to create the cron. A manual drain is:

Before the controlled purchase/refund reconciliation in #100, run the
repository's read-only, fail-closed preflight. It verifies the migration and
function source contracts, requires explicit non-secret deployment
attestations, checks the Stripe subscription contract, and writes a sanitized
evidence scaffold to an ignored path. It does not inspect secret values or
mutate Supabase, Stripe, GA4, or payment state.

Start from
`scripts/fixtures/analytics-reconciliation-attestation.example.json`, replace
every placeholder with sanitized evidence from the selected environment, and
keep the working copy under `output/analytics-reconciliation/`. The function
`sourceCommit` may be an earlier commit only when the tracked function and
shared analytics sources are byte-for-byte unchanged from current `HEAD`.

```text
npm run analytics:reconciliation-preflight -- --help

npm run analytics:reconciliation-preflight -- \
  --target staging-analytics \
  --stripe-mode test \
  --supabase-project-ref abcdefghijklmnopqrst \
  --operator launch-operator \
  --window-start 2026-07-18T16:00:00.000Z \
  --window-end 2026-07-18T17:00:00.000Z \
  --timezone America/Los_Angeles \
  --attestations output/analytics-reconciliation/attestations.json \
  --output output/analytics-reconciliation/2026-07-18T1600Z.json
```

Live mode additionally requires `--confirm-live-read-only`. That flag confirms
the target selection only; it does not authorize a live purchase, refund,
deployment, or legal acknowledgement. The command refuses output outside
`output/analytics-reconciliation/`, refuses overwrites and symlink traversal,
and rejects likely credentials or personal values in supplied attestations.

The generated file is an offline contract scaffold, not proof that Supabase,
Stripe, or GA4 is configured correctly. Every attestation includes a sanitized
capture label, capture time, and fixed source type; the operator must retain
and privately cross-check the underlying source-of-truth capture. Run the
preflight before the controlled test window; captures must be no more than 24
hours old and cannot be later than the preflight time. The scaffold therefore
records `externalDeploymentVerifiedByCommand: false`.

Do not paste raw query results or unrestricted notes into the scaffold. Record
only bounded outcomes, 12-character one-way fingerprints, and sanitized
evidence labels. Do not change the generated target, queries, preflight
contract, or privacy policy: the validator binds those immutable sections with
a SHA-256 contract fingerprint. That fingerprint detects accidental drift; it
is stored with the artifact and is not a signature or proof of authenticity.
The completed artifact must also record the full ordered cleanup checklist.
Before attaching it to GitHub, run:

```text
npm run analytics:reconciliation-evidence-check -- \
  output/analytics-reconciliation/2026-07-18T1600Z.json
```

That privacy/schema check still does not prove external truth. Run the growth
validator separately against its own privacy-reviewed reporting export, using
the positional path required by that validator:

```text
node scripts/validate-growth-reporting.mjs path/to/growth-export.json
```

```text
POST https://<project-ref>.supabase.co/functions/v1/ga4-outbox-drain
Authorization: Bearer <GA4_OUTBOX_DRAIN_AUTH_SECRET>
apikey: <GA4_OUTBOX_DRAIN_AUTH_SECRET>
Content-Type: application/json

{"limit":25}
```

Inspect queue health with aggregate, non-customer-level queries:

```sql
select status, count(*) as events, min(created_at) as oldest
from public.analytics_events
group by status
order by status;

select event_key, event_name, attempts, max_attempts, last_failure_kind,
       last_http_status, next_attempt_at, lease_expires_at, ambiguous_at,
       terminal_at, left(last_error, 200) as last_error
from public.analytics_events
where status in ('failed', 'ambiguous', 'dead_letter')
order by created_at;
```

Alert when a drain returns `transitionErrors` or
`splitBrainPersistenceFailures` above zero, when any `ambiguous` or
`dead_letter` row appears, when `leaseLost` is above zero, or when an eligible
`pending`/`failed` row remains
past its retry time for more than five minutes. Reconcile ambiguous rows before
manual retry. A service-role operator can requeue a reconciled row:

```sql
select *
from public.requeue_analytics_event(
  'purchase:<order-uuid>',
  'Reconciled against GA transaction and paid order; safe to retry',
  true
);
```

Pass `true` when requeueing an exhausted row so its attempt budget resets.
Rollback by unscheduling `ga4-outbox-drain-1m`; leave rows intact for
inspection, and redeploy the previous Stripe webhook only after confirming no
row is actively `sending`. Never delete or bulk-reset ambiguous rows.

## Launch reporting contract

The machine-readable source of truth for launch metrics, filters, data-quality
thresholds, review inputs, and the ranked experiment backlog is
`config/growth-reporting-contract.json`. It is separate from the GA4 property
configuration so the repository can verify definitions without analytics
credentials.

All reporting uses `America/Los_Angeles` as the business timezone and USD as the
launch currency. GA4 decisions use complete T+1 data unless a metric explicitly
says otherwise. Intraday data is directional. Core Web Vitals field data uses
its trailing 28-day source window and must be labeled accordingly.

Every GA4 session or rate is qualified as **consented**. It does not represent
visitors who declined analytics. Reports must suppress segmented cells with
fewer than 10 sessions and must never contain customer-level rows, artwork,
preview URLs, contact details, addresses, or free-form text.

### Metric families

The contract defines each metric's numerator, denominator, source, freshness,
timezone, owner role, and supported filters:

- acquisition: sessions and new users by source, medium, and campaign;
- intent: homepage CTA rate by placement and catalog-to-model selection;
- creation: editor first action, editor continuation, preview completion after
  continuation, and preview success/failure;
- commerce: add to cart, checkout start, purchase, checkout completion,
  product revenue, and revenue per consented session;
- experience: user-visible error rate and Core Web Vitals good-experience rate;
- trust: purchase/order reconciliation rate.

The two editor continuation metrics use distinct consented GA4 sessions:
`editor_continue_rate` divides sessions with `primary_cta_click` and
`placement=editor_continue` by sessions with `editor_first_action`, while
`editor_preview_completion_rate` divides sessions with `preview_success` by
sessions with that editor-continuation CTA event. Both are available T+1 from
`ga4_events` and allow only date, source, medium, campaign, device, and browser
filters.

Product revenue follows the GA4 purchase payload: item revenue after item
discounts, excluding shipping and tax. A purchase reconciles only when one
unique purchase transaction matches one paid order in transaction ID, currency,
product revenue, and the complete item identity: ID, name, brand, category,
variant, price, quantity, and discount.

Required dashboard filters are date, source, medium, campaign, device, browser,
phone family, and phone model. Filters apply only where the source supports
them; for example, CrUX field data supports date/device but not campaign.

### GA4 reporting-dimension map

`dashboard.reportingDimensions` is the authoritative report-builder map. GA4
Data API names and scopes are intentional:

| Report use | GA4 source | Scope | Storefront parameter |
| --- | --- | --- | --- |
| Date | `date` | event | built in |
| Source / medium / campaign | `sessionSource`, `sessionMedium`, `sessionCampaignName` | session | built in |
| Device / browser | `deviceCategory`, `browser` | user | built in |
| Phone family on editor/preview/error events | `customEvent:brand` | event | `brand` |
| Phone model on editor/preview/error events | `customEvent:model` | event | `model` |
| Phone family/model in ecommerce item reports | `itemBrand`, `itemVariant` | item | `item_brand`, `item_variant` |
| CTA placement | `customEvent:placement` | event | `placement` |
| Phone variant | `customEvent:variant_id` | event | `variant_id` |
| Error code/stage | `customEvent:error_code`, `customEvent:stage` | event | `error_code`, `stage` |
| Contract version | `customEvent:analytics_contract_version` | event | `analytics_contract_version` |

The seven `customEvent:*` sources above are registered as event-scoped custom
dimensions. Do not substitute `itemBrand`/`itemVariant` for custom event
parameters: the standard ecommerce dimensions are item-scoped and answer a
different question. Metrics with phone filters therefore declare
`dimensionBindings`: editor, preview, and error metrics bind to the event
dimensions, while ecommerce, revenue, and reconciliation metrics bind to the
item dimensions. The validator rejects missing, swapped, invented, malformed,
or differently scoped sources.

Never register transaction, session, client, user, order, artwork/design,
contact, address, phone, email, or free-text values as custom dimensions. This
privacy floor is enforced independently of the configurable prohibited-field
list, so removing a configuration entry cannot make that field reportable.

Newly registered custom dimensions need Google's normal processing time before
they are available consistently in reports, and their registration does not
retroactively populate historical events. Keep a dependent report or filter
pending until the dimension is observable. Never backfill a missing historical
dimension with an invented baseline.

Build or refresh the reporting surface in this order:

1. confirm the seven custom definitions and their event scope in GA4 Admin;
2. wait until each `customEvent:*` dimension is selectable in the report;
3. add built-in acquisition/device dimensions, then custom event dimensions;
4. add standard ecommerce item dimensions in item-scoped report sections;
5. apply the consented-only label and suppress segments below 10 sessions;
6. validate complete T+1 windows, then reconcile purchases, paid orders,
   currency, items, and product revenue before recording evidence.

### Evidence lifecycle

The checked-in contract remains
`repository_ready_external_evidence_pending`. The validator also accepts
`partially_evidenced` and `evidence_backed_completed` when the state proves
itself. Report creation, baseline capture, cadence assignment, reconciliation,
and each experiment baseline/result transition require a named owner, ISO
timestamp, non-placeholder HTTPS evidence reference, meaningful notes, and,
where data is evaluated, a complete T+1 window. Experiment results additionally
require control/variant values and a decision whose winner is internally
consistent. A winner also requires structured evidence that the
pre-registered sample, at least 14 complete days, at least two weekly cycles,
and guardrails all passed. Every recorded result includes per-arm session and
conversion counts, an absolute minimum detectable effect, alpha, power, and a
declared required sample per arm. The validator derives the minimum sample from
the captured baseline, MDE, alpha, and power; derives both rates, the two-sided
two-proportion z-test p-value, and confidence interval from the arm counts; and
requires the declared statistics to match. A winner additionally requires both
arms to meet the derived sample, `p < alpha`, and a confidence interval wholly
in the winner's direction. An underpowered release may be recorded only as an
inconclusive observational result.

Reconciliation must satisfy the configured count and revenue tolerance. A
completed reconciliation is valid only when the combined validator binds its
positive counts, numeric revenue, exact window, evidence ID/URL, generated
timestamp, and source to the analyzed export. The export must be explicitly
non-synthetic, contain sessions, events, at least one purchase and paid order,
cover at least one full 24-hour complete T+1 window, and use the contract
currency. Evidence timestamps and windows cannot be in the future beyond the
small validation clock-skew allowance. Export generation must occur after the
window and within the configured T+1 lag; every event and paid order must have
a valid timestamp inside the half-open export window.

`evidence_backed_completed` means the reporting foundation, baseline,
reconciliation, and named review cadence are complete. Ranked experiments keep
independent baseline/result lifecycles; unrun future experiments may remain
pending and do not misrepresent the reporting foundation as incomplete.

The lifecycle examples under `scripts/fixtures/` exist only to test the
validator. They are not production evidence and must never be copied into the
live contract as baselines, experiment results, or owner assignments.

### Automated data-quality gate

Run `npm run growth:check` against the included synthetic export, or pass a
privacy-reviewed export path to the validator:

```text
node scripts/validate-growth-reporting.mjs path/to/export.json
```

The gate fails on duplicate purchase transactions, missing ecommerce item IDs,
unexpected `(not set)` values in required dimensions, unnormalized or
high-cardinality paths, unknown event names, prohibited fields, and purchase
count/revenue/full-item-identity mismatch. Aggregate product revenue may differ
by at most the greater of $0.01 or 0.1%; anything larger requires investigation
before a dashboard or experiment decision is trusted.

The export format is a positive schema: report, window, session, event, order,
and item objects accept only documented keys and required types, and
`exportVersion` must be the supported `1.0.0`. Unknown
aliases such as contact or mobile-number fields fail even if they do not appear
in the configured denylist. Email- and phone-like values also fail recursively
when hidden in allowlisted campaign, CTA, or catalog fields; high-value strings
use field-specific length and character bounds. Phone heuristics apply to
human-readable, display, attribution, and URL values; schema-validated system
identifiers, versions, and timestamps use their strict bounded formats so
numeric GA session IDs, numeric SKUs, and UUID transaction IDs remain valid.
Null collection entries fail as schema findings instead of crashing validation.
Session IDs must be unique, and every event must reference exactly one exported
session. Event transaction IDs are required and bounded on purchase and refund
events and rejected on every other event name. Event-specific
parameters keep the report dimensions executable: CTA events require placement,
design/editor/preview events require their emitted phone context, diagnostic
events require their applicable error code/stage, and supported optional emitter
fields such as `has_angled_view` remain schema-valid. Purchase `value` and paid-order
`product_revenue` must be present finite non-negative numbers, and each must
reconcile to the sum of strict item price-minus-discount times quantity.
Purchase shipping and tax must match the paid order, whose total must equal
product revenue plus shipping and tax. This is a paid-order export: every order
must use `paid`, a unique transaction ID, a valid in-window timestamp, coherent
numeric values, and the strict item schema; every transaction must have exactly
one purchase and one order. Data-quality arrays remain canonical and
tolerance/cardinality settings may become stricter but cannot be weakened
beyond the checked-in ceilings.

The checked-in export fixture is synthetic. Its single matching purchase and
paid order prove the validator, not production collection or dashboard
accuracy.

## Growth review and experiments

The contract ranks five ethical launch experiments and pre-registers hypothesis,
audience, primary metric, guardrails, effort, minimum-run rule, and stop
criteria. The first CTA-copy experiment also includes implementation and
analysis plans plus accessibility and performance guardrails.

The current pending contract claims no baseline, owner, result, or winner.
Before the first experiment:

1. complete the #66 production analytics rollout and order/refund
   reconciliation evidence;
2. build and verify the GA4 reporting surface against this contract;
3. capture and link the production baseline;
4. have a named human accept the weekly growth-review cadence;
5. open a dedicated experiment issue from the repository template and
   pre-register the exact variants, sample rule, and decision criteria.

If traffic cannot meet a pre-registered useful sample, use a sequential release
and label the result observational. Never declare a winner from clicks alone,
tiny samples, early stopping, or a result that harms purchase, accessibility,
performance, or user-visible error guardrails.
