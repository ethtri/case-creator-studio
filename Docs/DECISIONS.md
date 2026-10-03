# Decisions

Lightweight record of key decisions for AI agents.

## 2026-10-03
- Website #333 replaces the unpatched Tailwind 3/braces build chain with official
  Tailwind 4.3.3/PostCSS. Both production and full-tree high-severity audit gates
  remain required. This removes the vulnerable dependency; it does not claim an
  upstream braces patch. Existing moderate React Router findings remain outside
  this bounded change.
- Retain the existing theme/config and animation plugin as build dependencies;
  remove development-only Lovable tagging because it pins Tailwind 3. Preserve
  container width/padding, v3 shadow/blur/ring defaults, sRGB gradients, control
  cursor/placeholder colors and visible forced-color keyboard focus. Reusable
  sidebar/chart variable classes use explicit `var(...)` syntax.
- Tailwind 4's official minimum browsers are Safari 16.4, Chrome 111 and Firefox
  128 (https://tailwindcss.com/docs/upgrade-guide, retrieved 2026-10-03). No older
  minimum-version contract exists in current repository docs; older browsers are
  a compatibility risk, not silently verified coverage. Required real iOS
  Safari/Android Chrome and the owner's iPhone Chrome acceptance remain open in
  #322. Chromium fixtures and production CSS checks do not establish device proof.
- Roll back the exact reviewed dependency merge independently of editor changes
  if needed; rollback restores the known vulnerable build chain and re-blocks
  release until another maintained remediation passes both audits.

## 2025-12-22
- EDM is the primary editor; Fabric.js editor is archived.
- Preview images come from Printful mockup generation tasks.
- Stripe is used for checkout and payment processing.
- Supabase Edge Functions handle EDM nonce + mockup calls.

## 2026-05-03
- Printful remains the production fulfillment default while the onshore pilot is validated.
- Onshore v1 is Snapcase site orders only, paid through Stripe, and routed to a manual internal production queue.
- Kexiazhan machine automation is deferred until file upload, prepaid/internal payment, machine targeting, and failure-state behavior are confirmed.
- `onshore_manual` requires both `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true`; production should keep the allow flag unset until a controlled pilot is approved.
- The tokenized Kexiaozhan/Xiaojiang URL is operator-only and must not become a public CTA. The preferred research target is vendor designer output feeding back into Snapcase-owned Stripe checkout and onshore queue.

## 2026-07-16
- `https://www.snapcase.ai` is the canonical public host. Vercel already serves it
  as the primary production domain and redirects the apex host to it. Canonical
  tags, sitemap URLs, structured data, social metadata, analytics locations, and
  public return URLs must use `www`; the apex redirect must remain permanent.

## 2026-07-18
- EasyPost is the automated shipping provider for the onshore pilot. Snapcase
  validates recipients and rates after job creation, but purchases postage only
  after an operator marks the job `printed`.
- EasyPost automation is server-controlled and fail-closed. Production requires
  both `EASYPOST_MODE=production` and `EASYPOST_PRODUCTION_ENABLED=true`;
  customer or operator input cannot choose an unapproved carrier, service, or
  rate.
- Shipping labels remain private PDFs in Supabase Storage. Operators receive
  only short-lived signed print URLs, and provider webhook storage is limited to
  the identifiers and statuses required for durable replay.
- An ambiguous purchase or refund enters an explicit reconciliation state.
  Snapcase retrieves the provider shipment before any retry and never purchases
  duplicate postage blindly.
