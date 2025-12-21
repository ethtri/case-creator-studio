# Backlog

## High Priority
- [ ] Preview page uses EDM output - render preview based on EDM template output.
- [ ] EDM preview mismatch - preview shows blank case; debug Printful mockup task output + failure reasons.
- [ ] Pricing/Stripe alignment - ensure EDM pricing and checkout totals match.
- [ ] Remove Printful references from UI copy - replace with Snapcase-first wording.
- [ ] EDM error handling + fallback UX - user-friendly error state and retry, no broken flow.
- [ ] Production allowlist sanity check - confirm Monday launch domains are whitelisted for EDM.
- [ ] QA smoke test checklist - designer load, save template, preview, checkout, order submission.
- [ ] Pre-MVP pricing rationalization - include shipping costs; consider dynamic pricing based on costs to target ~20% margin for MVP.

## Medium Priority
- [ ] EDM preview debug badge/log - surface when EDM templateId is missing on preview.

## Low Priority
- [ ] EDM performance tuning - speed up save/preview transitions for smoother UX (mockup generation latency).

## Ideas / Future
- [ ] Post-MVP accounts - add login to let users save designs to their account and view design history.
- [ ] Post-MVP catalog thumbnails - replace generic phone images with standardized, higher-quality variant-specific icons; evaluate licensed library or generate assets with gen AI.

## Completed
- [x] EDM-first flow - make EDM the primary editor path; archive/stash Fabric.js editor.
- [x] EDM save flow - remove "Save design" button and auto-save on "Continue to preview" (current Save is broken).
- [x] Capture EDM templateId + selected variant in session - ensure checkout/order uses EDM state.
- [x] EDM design persistence - returning to EDM shows blank design; persist template across visits.
- [x] EDM continue-to-preview regression - button no longer navigates to preview; investigate save callback flow.

## Moved to Sprint
- [x] [Description] - Sprint [N] on [Date]
