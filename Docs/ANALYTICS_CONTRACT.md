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
refund concurrently. Failed sends remain visible and can be reclaimed by a
later duplicate/retry; a five-minute lease also makes an interrupted send
reclaimable.

The server payload is built from the stored order and includes transaction ID,
currency, value, shipping, coupon, tax, and safe line-item fields. Browser
artwork and contact details are never copied into it.

Deployment requires `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` in the Stripe
webhook environment. They must be configured outside source control. Before
closing issue #66, attach GA4 DebugView (or equivalent) evidence for a completed
test order and refund, and record owner/counsel approval of the selling-region
consent policy.

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

The checked-in fixture is synthetic. Its single matching purchase and paid
order prove the validator, not production collection or dashboard accuracy.

## Growth review and experiments

The contract ranks five ethical launch experiments and pre-registers hypothesis,
audience, primary metric, guardrails, effort, minimum-run rule, and stop
criteria. The first CTA-copy experiment also includes implementation and
analysis plans plus accessibility and performance guardrails.

No baseline, owner, result, or winner is claimed. Before the first experiment:

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
