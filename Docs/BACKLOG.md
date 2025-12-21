# Backlog

## High Priority
- [ ] Pricing/Stripe alignment - ensure EDM pricing and checkout totals match.
- [ ] Remove Printful references from UI copy - replace with Snapcase-first wording.
- [ ] EDM error handling + fallback UX - user-friendly error state and retry, no broken flow.
- [ ] Preview retry control - allow users to re-generate the mockup if Printful fails or times out.
- [ ] Production allowlist sanity check - confirm Monday launch domains are whitelisted for EDM.
- [ ] QA smoke test checklist - designer load, save template, preview, checkout, order submission.
- [ ] Pre-MVP pricing rationalization - include shipping costs; consider dynamic pricing based on costs to target ~20% margin for MVP.

## Medium Priority
- [ ] EDM preview debug badge/log - surface when EDM templateId is missing on preview.
- [ ] Printful rate-limit handling - backoff and retry policy for mockup generation.

## Low Priority
- [ ] EDM performance tuning - speed up save/preview transitions for smoother UX (mockup generation latency).
- [ ] Post-MVP logging polish - audit/remove remaining production debug logs across EDM + preview flows.
- [ ] Cache Printful mockup style IDs per product/variant to reduce API chatter.

## Ideas / Future
- [ ] Explore 3D mockups for newer variants that only expose a single front style in Printful.
- [ ] Post-MVP accounts - add login to let users save designs to their account and view design history.
- [ ] Post-MVP catalog thumbnails - replace generic phone images with standardized, higher-quality variant-specific icons; evaluate licensed library or generate assets with gen AI.

## Completed
- [x] EDM preview uses Printful mockup tasks with product_template source and variant-specific mockup styles.
- [x] EDM preview no longer shows blank cases; surfaced Printful failure reasons in UI.
- [x] Preview caches and serves front mockups reliably; hides 3D controls when no angled mockup exists.
- [x] Prewarm EDM mockup task on template save for faster preview load.
- [x] Gate EDM debug logs to dev-only.
- [x] EDM-first flow - make EDM the primary editor path; archive/stash Fabric.js editor.
- [x] EDM save flow - remove "Save design" button and auto-save on "Continue to preview" (current Save is broken).
- [x] Capture EDM templateId + selected variant in session - ensure checkout/order uses EDM state.
- [x] EDM design persistence - returning to EDM shows blank design; persist template across visits.
- [x] EDM continue-to-preview regression - button no longer navigates to preview; investigate save callback flow.

## Moved to Sprint
- [x] [Description] - Sprint [N] on [Date]

