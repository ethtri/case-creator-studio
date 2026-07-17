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

The event `page_location` also uses the normalized path so generated IDs do not
become high-cardinality dimensions.

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

The browser stores approved first-touch and last-touch values separately:

- UTM source, medium, campaign, term, and content
- `gclid`, `fbclid`, and `ttclid`
- external referrer
- landing path and capture time

The first touch is immutable. A later visit with campaign parameters updates
only the last touch. Attribution is attached to the order request and stored in
the existing `orders.marketing_attribution` JSON field.

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
later duplicate/retry.

The server payload is built from the stored order and includes transaction ID,
currency, value, shipping, coupon, tax, and safe line-item fields. Browser
artwork and contact details are never copied into it.

Deployment requires `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` in the Stripe
webhook environment. They must be configured outside source control. Before
closing issue #66, attach GA4 DebugView (or equivalent) evidence for a completed
test order and refund, and record owner/counsel approval of the selling-region
consent policy.
