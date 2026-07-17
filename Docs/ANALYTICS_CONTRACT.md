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

## Product and diagnostic events

- `primary_cta_click`: placement, label, and destination
- `design_start`: selected model
- `editor_first_action`: first design change only
- `preview_success`: preview completed
- `preview_failure`: categorical error code only
- `design_save`: design save completed
- `editor_error`: categorical error code only
- `checkout_error`: categorical error code and stage only
- `promo_applied`: code and discount amount

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
values must be configured outside source control. Before
closing issue #66, attach GA4 DebugView (or equivalent) evidence for a completed
test order and refund, and record owner/counsel approval of the selling-region
consent policy.

### Outbox operations

Deploy the hardening migration before the updated Stripe webhook and worker,
then deploy `ga4-outbox-drain` before applying the cron migration. Do not apply
this chain until the production migration backlog and required secrets have
been reviewed. A manual drain is:

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
- creation: editor first action and preview success/failure;
- commerce: add to cart, checkout start, purchase, checkout completion,
  product revenue, and revenue per consented session;
- experience: user-visible error rate and Core Web Vitals good-experience rate;
- trust: purchase/order reconciliation rate.

Product revenue follows the GA4 purchase payload: item revenue after item
discounts, excluding shipping and tax. A purchase reconciles only when one
unique purchase transaction matches one paid order in transaction ID, currency,
product revenue, and item ID/price/quantity/discount.

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
different question. Never register transaction, session, client, user, order,
artwork/design, contact, address, or free-text values as custom dimensions.

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
consistent. Reconciliation must satisfy the configured count and revenue
tolerance.

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
count/revenue/item mismatch. Aggregate product revenue may differ by at most
the greater of $0.01 or 0.1%; anything larger requires investigation before a
dashboard or experiment decision is trusted.

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
