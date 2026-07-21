# MVP Scope

Single source of truth for launch scope. GitHub Issues is the operational source
of truth for work status; `Docs/DECISIONS.md` wins if documents disagree.

**Last updated:** 2026-07-21

## In Scope (MVP)

- EDM-first phone-case design with Printful-backed mockup previews.
- Cart, live Stripe Checkout, verified order confirmation, and consistent
  pricing across the catalog, cart, Stripe, and order records.
- Printful as the public-production fulfillment default and rollback provider.
- Accounts, saved designs, authenticated order history, and recovery after an
  interrupted or canceled checkout.
- Transactional order and authentication email from `hello@snapcase.ai`, with
  support replies routed to `support@snapcase.ai`.
- A controlled onshore pilot behind explicit server-side gates: signed
  Kexiaozhan handoff, Snapcase-owned Stripe payment, deferred administrator
  print release, one durable production job, and policy-controlled EasyPost
  shipping after the physical identity workflow is proven.

## Out of Scope (Post-MVP)

- Unattended or high-volume Kexiaozhan production, parallel same-model output,
  or live onshore traffic before the supervised pilot gates pass.
- Customer-facing machine payment, Amazon-order intake, and vendor capabilities
  that have not been confirmed and tested.
- Kexiaozhan print-status/reprint automation and automatic exception recovery
  beyond the approved manual pilot workflow.
- 3D mockups beyond available Printful styles, broad catalog-asset expansion,
  and performance tuning beyond launch stability and security fixes.

## Must-Not-Break Flows

- Editor -> preview -> cart -> Stripe Checkout -> verified order confirmation.
- Pricing, quantity, shipping, and order identity remain consistent across the
  browser, Stripe, Supabase, email, and the selected fulfillment provider.
- Printful remains the default for normal public orders and the one-change
  rollback path for newly created orders.
- Authentication, saved designs, order history, payment verification, and
  duplicate/replay protection remain fail closed.
- Transactional email accepts only signed, fresh delivery events and cannot make
  an already accepted order email eligible for duplicate sending.
- Any onshore pilot order produces exactly one durable job, keeps callbacks and
  postage server-controlled, and blocks/quarantines an uncertain physical-case
  identity instead of allowing shipment.

## Definition of Done (MVP)

- Every open GitHub issue labeled `P0` that blocks the controlled
  production-ready pilot is completed or explicitly removed from MVP scope by a
  recorded decision.
- `Docs/QA_SMOKE_TEST_CHECKLIST.md` passes for the public production-default
  flow, and the supervised onshore scenarios pass in the isolated environment
  named by the applicable issue/runbook.
- The first controlled pilot has an evidence-backed order-to-job-to-case-to-label
  chain, approved operator and quarantine procedures, and no duplicate payment,
  production job, label, or customer notification.
- Production configuration, secrets, logs, monitoring, and rollback are verified
  without exposing credentials or customer data.
- No critical errors or unresolved fail-open conditions remain in the launch
  paths, and all required PR checks are green on current `main`.
