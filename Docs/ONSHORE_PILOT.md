# Onshore Operations Pilot

Concise operating guide for moving Snapcase site orders from Printful fulfillment to Snapcase-operated production without disabling the live site.

## Pilot Scope

- V1 is Snapcase site orders only.
- Customers continue paying through Stripe.
- Production default remains Printful. `onshore_manual` requires both `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true` in the target Supabase environment.
- Onshore pilot orders route to an internal manual production queue. They do not call Kexiazhan mutating APIs.
- Amazon orders, customer-facing machine payment, and automatic machine submission stay out of v1.

## Operating Model

- Parent agent acts as PM/PO: scope, backlog, acceptance criteria, PR readiness, risk tracking, and sprint retrospective.
- Sub-agents can be assigned bounded roles such as backend worker, QA reviewer, challenge reviewer, and API researcher.
- Use high reasoning by default for sub-agents; use extra-high for security-critical or ambiguous integration work.
- Do not interrupt sub-agents once assigned. Wait at integration checkpoints only.
- Each implementation agent works in a separate `../wt-<slug>` worktree on an `agent/<slug>` branch.

## Current Implementation

- `route-fulfillment-order` is the provider gate after Stripe payment.
- `printful` remains the default provider and forwards to `submit-printful-order`.
- `onshore_manual` creates or reuses one `production_jobs` row per order.
- `/operations` is an authenticated internal queue backed by server-side operator allowlist checks.
- Operator updates can move jobs through `queued`, `artwork_ready`, `printed`, `packed`, `shipped`, or `failed`.

## Deployment Notes

- Apply the database migration before deploying Edge Functions that write `orders.fulfillment_*` columns or `production_jobs`.
- Keep production unset or set to `FULFILLMENT_PROVIDER=printful`; keep `ALLOW_ONSHORE_MANUAL` unset in production until cutover gates pass.
- Use `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true` only in staging/preview until pilot approval.
- Configure `OPERATOR_EMAILS` as a comma-separated allowlist in environments where `/operations` should be usable.
- `route-fulfillment-order` accepts Supabase's runtime service-role key and can also accept `ROUTE_FULFILLMENT_AUTH_SECRET` for staging/QA service-role calls. Never expose that secret to browsers.
- The isolated Supabase staging project is `snapcase-onshore-staging` (`onztuktjcmjukfhcuphh`). Do not commit keys or service-role credentials.
- Rollback by environment change affects newly created checkouts. Orders already persisted with `fulfillment_provider=onshore_manual` stay in the manual queue unless an operator explicitly cancels, completes, or reroutes them.

## Vendor Questions Before Automation

- File upload: what endpoint creates the `filePath` required by `POST /v1/order`, and can it accept Snapcase-hosted artwork?
- Prepaid payment: can Stripe-paid orders use an internal/free payment method such as `machineFree` or `couponFree`, and which payment fields are required?
- Machine targeting: is the target machine selected by token scope, order payload, or a separate print-routing endpoint?
- SKU/material mapping: what are the authoritative `brandId`, `goodsSkuId`, `materialIds`, shelf, stock, and magnetic/ordinary mappings?
- Artwork specs: what dimensions, crop, bleed, color profile, file formats, and safe-area templates are required per SKU?
- Idempotency/failure: what keys, callbacks, retries, cancellation/reprint APIs, and machine failure states are canonical?

## Rollout Gates

- Staging test proves Stripe test payment creates exactly one onshore manual job.
- Duplicate webhook or success-page verification does not duplicate jobs.
- Operator allowlist blocks non-operators from reading or updating jobs.
- A test order can be manually printed, packed, shipped, and tracked.
- Rollback for new orders is one environment change from `onshore_manual` back to `printful`; already-queued onshore jobs require manual operator disposition.
- Machine automation waits until vendor questions are answered and tested in a non-production machine flow.

## Sprint Retro Log

### 2026-05-03 - Pilot Foundation

- Product: Keep Stripe and Snapcase checkout as the source of truth; the machine UI is a local kiosk flow, not a shipped-order checkout.
- Functionality: Use a manual production queue first because `filePath`, prepaid payment, and machine-targeted print submission remain unverified.
- Operating model: Sub-agents worked best when split by backend implementation and independent QA/challenge review with explicit no-interruption guidance.

### 2026-05-03 - Staging Validation Attempt

- Product: No cutover. PR #27 remains open and production stays Printful-backed.
- Functionality: Code checks passed, but full staging QA is blocked until there is an accessible preview/staging target plus a non-production Supabase environment with the migration, Edge Functions, `FULFILLMENT_PROVIDER=onshore_manual`, and `OPERATOR_EMAILS`.
- Operating model: Parallel staging, QA, challenge, and API research agents surfaced useful blockers quickly; next validation sprint should start by provisioning staging access before checkout smoke tests.

### 2026-05-03 - Sprint 1 Staging Lane Checkpoint

- Product: Production remains Printful-backed; staging is the only intended lane for `onshore_manual`.
- Functionality: Created an isolated Supabase staging project, repaired local migration history so a fresh staging database can be built, deployed staging Edge Functions, set branch-scoped Vercel Supabase env, and enabled protected-preview automation bypass. Full checkout QA still needs Stripe test/email secrets.
- Operating model: Challenge review added one extra production-safety gate, `ALLOW_ONSHORE_MANUAL=true`, so an accidental provider env change alone cannot send live orders to the manual queue.
