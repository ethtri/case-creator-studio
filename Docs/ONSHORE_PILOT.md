# Onshore Operations Pilot

Concise operating guide for moving Snapcase site orders from Printful fulfillment to Snapcase-operated production without disabling the live site.

## Pilot Scope

- V1 is Snapcase site orders only.
- Customers continue paying through Stripe.
- Production default remains Printful unless `FULFILLMENT_PROVIDER=onshore_manual` is set in the target Supabase environment.
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
- Keep production unset or set to `FULFILLMENT_PROVIDER=printful`; use `FULFILLMENT_PROVIDER=onshore_manual` only in staging/preview until cutover gates pass.
- Configure `OPERATOR_EMAILS` as a comma-separated allowlist in environments where `/operations` should be usable.

## Vendor Questions Before Automation

- How does external artwork become the `filePath` required by `POST /v1/order`?
- Can prepaid Stripe orders create free/internal Kexiazhan orders without customer machine payment?
- What endpoint targets a specific machine and submits a print job?
- What image dimensions, crop, bleed, color profile, SKU/material IDs, and stock semantics are required?
- What idempotency keys, cancellation paths, retries, and failure states should be used?
- How are offline, out-of-stock, jammed, low-ink, and print-failure states exposed?

## Rollout Gates

- Staging test proves Stripe test payment creates exactly one onshore manual job.
- Duplicate webhook or success-page verification does not duplicate jobs.
- Operator allowlist blocks non-operators from reading or updating jobs.
- A test order can be manually printed, packed, shipped, and tracked.
- Rollback is one environment change from `onshore_manual` back to `printful`.
- Machine automation waits until vendor questions are answered and tested in a non-production machine flow.

## Sprint Retro Log

### 2026-05-03 - Pilot Foundation

- Product: Keep Stripe and Snapcase checkout as the source of truth; the machine UI is a local kiosk flow, not a shipped-order checkout.
- Functionality: Use a manual production queue first because `filePath`, prepaid payment, and machine-targeted print submission remain unverified.
- Operating model: Sub-agents worked best when split by backend implementation and independent QA/challenge review with explicit no-interruption guidance.
