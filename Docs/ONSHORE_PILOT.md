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

## Open Hardening Items

- Tighten preview origin matching before merge or cutover. Public payment endpoints should allow exact production origins plus a strict preview allowlist, not broad substring matching.
- Make Stripe test mode fail closed before merge or cutover: when `STRIPE_MODE=test`, require `STRIPE_SECRET_KEY_TEST` and `STRIPE_WEBHOOK_SECRET_TEST` instead of falling back to generic env names.
- Rotate the pasted Stripe test secret and any staging-only route/preview bypass secrets after staging validation.
- Remove or reset temporary staging operator credentials after the manual dry run.
- Keep the current tokenized Kexiaozhan/Xiaojiang URL operator-only. Do not expose it through public Snapcase CTAs, docs, logs, screenshots, or customer-visible redirects.

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

### 2026-05-03 - Sprint 2 Stripe Staging Smoke

- Product: Stripe test checkout can fund a staging onshore order without touching Printful or Kexiazhan.
- Functionality: Created the staging Stripe webhook, completed a Stripe sandbox Checkout payment, fixed the Edge runtime webhook verifier to use Stripe's async signature path, and confirmed exactly one `onshore_manual` job. Duplicate event replay kept one job, operator allowlist blocked a non-operator, operator status/tracking updates persisted, and a temporary `printful` provider rollback checkout created no onshore job.
- Operating model: Owner only had to supply the Stripe test secret; PM/agent team handled webhook creation, Supabase secret setup, browser checkout, QA replay, operator auth test users, rollback smoke, and PR hardening.

### 2026-05-03 - Owner Dry Run Ready

- Product: Production remains unchanged and PR #27 remains open/unmerged; this is still a staging-only manual onshore pilot.
- Functionality: Created a fresh Stripe sandbox payment for order `d89cfec5-d190-4209-aff5-c017c22225c6`, which queued production job `a059d2eb-3ada-4dd5-8f32-a4fa88e1a873`. A second route call returned the existing job with `created=false`, confirming no duplicate job was created.
- Operating model: QA confirmed staging/production isolation and challenge review approved a staging dry run while calling out origin matching, Stripe test fail-closed behavior, and secret rotation as required hardening before merge/cutover.

### 2026-05-03 - Vendor Designer Research Sprint

- Product: Vendor catalog breadth is better than Snapcase's current catalog, but the current vendor URL is token-gated and is not safe as a public CTA.
- Functionality: The viable target is vendor designer output feeding back into Snapcase-owned cart, Stripe checkout, order record, and onshore queue. The vendor `Print` path remains the unsafe order/payment boundary until API answers confirm an internal/prepaid path.
- Operating model: API, UX, vendor UI, and security sub-agents independently converged on the same recommendation: pursue a hybrid integration only after lead engineer/vendor questions are answered.
