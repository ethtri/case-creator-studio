# Backlog

Short, prioritized list only. Use P0/P1/P2. Remove completed items after verification to keep it short.

## P0 (MVP Launch)
- [x] Remove Printful references from UI copy - replace with Snapcase-first wording.
- [x] EDM error handling + fallback UX - user-friendly error state and retry, no broken flow.
- [x] Production allowlist sanity check - confirm launch domains are whitelisted for EDM.
- [x] Pre-MVP pricing rationalization - include shipping costs; target ~20% margin for MVP.
- [x] Designer mobile UX optimization - maximize EDM editor space by removing redundant text, make "Continue to preview" easier to access (floating footer/button), add a clear back-to-catalog button if the user picked the wrong case type.
- [x] Orders missing shipping address in Supabase after Stripe checkout - update Stripe session parsing (shipping_details + collected_information + customer_details).
- [x] Fix automatic Printful submission after Stripe webhook (no manual trigger) - ensure checkout.session.completed invokes submit-printful-order, writes printful_order_id/printful_status, and transitions status to processing.
- [x] Confirm Printful orders auto-confirm (not draft) after adding confirm=true - run live checkout and verify status in Printful + Supabase.
- [x] Add Printful failure guardrails - retry submission (initial + 3 retries over ~15 minutes) and auto-refund in Stripe if all retries fail; mark order status failed + store last_error.
- [x] Schedule `printful-retry` cron (*/5) in Supabase.
- [ ] Clean up test artifacts - refund live Stripe test charges and cancel or archive draft Printful orders created during validation.
- [ ] Accounts - email/password + OAuth login, saved designs, and authenticated order history.
- [x] Block checkout/add-to-cart until EDM template is saved; ensure cart items carry `edmTemplateId` for fulfillment.
- [x] Lock down Printful submission endpoints (`submit-printful-order`, `printful-retry`) with verified service-role auth.

## P1 (Post-Launch Soon)
- [x] EDM preview debug badge/log - surface when EDM templateId is missing on preview.
- [x] Cache Printful mockup style IDs per product/variant to reduce API chatter.
- [ ] Automated customer emails after order (tracking + status updates).
- [ ] Add EDM mobile analytics events (immersive enter/exit + CTA click).
- [ ] Address npm audit vulnerabilities (3 moderate, 1 high).
- [ ] Narrow Stripe webhook events (currently wildcard) after verification - restrict to checkout.session.completed + async_payment_succeeded.
- [x] Enforce allowlisted origins for Stripe checkout success/cancel URLs in `create-checkout`.
- [x] Secure or retire unused `lookup-orders` endpoint (require auth or remove if not used).

## P2 (Later)
- [x] EDM performance tuning - speed up save/preview transitions (mockup latency).
- [x] Post-MVP logging polish - audit/remove remaining production debug logs across EDM + preview flows.
- [x] Post-MVP share card branding - replace Lovable icon/banner with Snapcase assets for SMS/social previews.
- [x] Post-MVP SEO optimization - metadata, sitemap, and structured data review.
- [ ] Lint cleanup - replace editor/supabase `any` types, fix tailwind require, and remove lint warnings.
- [ ] EDM mobile UX - editor requires slight scroll to reach bottom toolbar on small screens.
- [ ] Preview mockup throughput - validate Printful rate limits under concurrent load and add queue/backoff if needed.
- [ ] Explore 3D mockups for variants with only a single front style.
- [ ] Catalog thumbnails - replace generic images with standardized variant icons.
- [ ] Unify account menu in editor top bars (DesignEditor + DesignEditorEDM) for consistent access without changing the mobile-optimized EDM header/banner.
- [ ] Review remaining navigation CTAs (Popular models "View all", menu labeling) for redundancy and clarity.


