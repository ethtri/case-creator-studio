# Current Status

Owner-updated snapshot for AI agents. GitHub Issues is the operational source
of truth; `Docs/DECISIONS.md` remains authoritative for recorded decisions.

**Last updated:** 2026-08-26
**Last updated by:** Codex
**MVP target:** Controlled production-ready pilot
**Sprint goal:** Prove the order-to-physical-case identity chain and finish the
remaining supervised onshore-pilot gates.

## Blockers

- #148 must prove an auditable identity chain from Snapcase order to Kexiaozhan
  job, physical case, and shipping label. It blocks the final `/operations`
  workflow (#116), Alejandro dry run (#117), and production pilot (#32).
- Alejandro must provide the measured packed-case dimensions and weight,
  confirm the usable label-printer format, and confirm the production
  origin/return address (#122).
- The device-689 manual release passed: Alejandro reported that the test
  "printed normally" on 2026-08-26, closing #35, #36, and #40. This proves the
  deferred-print release and physical printer path, but not the order-to-case-to-
  label identity chain.

## Top 3 Next Tasks

1. P0 #148/#122: collect one consolidated Alejandro follow-up covering the
   remaining physical identity, packed-package, label-printer, and origin facts.
2. P0 #148: approve the normal, quarantine, and concurrency workflow from the
   observed evidence, then rewrite and implement #116 to match it.
3. P0 #117: run the synthetic end-to-end Alejandro dry run, including test
   postage, before any real customer pilot.

## Now / Next / Later

**Now**

- Gather the remaining #148/#122 facts from the existing printed test case. No
  new payment, vendor order, or Kexiaozhan engineering request is needed.

**Next**

- Approve the #148 workflow, complete #122, rewrite and implement #116, and
  validate the complete operator flow through #117.

**Later**

- Run the supervised production pilot (#32) only after every P0 gate passes;
  keep unattended Kexiaozhan automation and reprint/status APIs (#29) post-pilot.

## Current Baseline

- The public site uses `https://www.snapcase.ai`, the EDM-first design flow,
  live Stripe Checkout, and Printful as the production fulfillment default.
- Checkout-start analytics now waits for a validated hosted Stripe Session,
  remains latched through redirect, and excludes customer, design, attribution,
  URL, and Session data. Production ingestion and QA-exclusion proof remain
  tracked in #244 until observed by the read-only measurement importer.
- Onshore fulfillment remains a controlled, fail-closed pilot. Signed
  Kexiaozhan handoff, deferred-print callback, one-job routing, and EasyPost
  shipping foundations are proven in isolated staging; production gates remain
  disabled until the open P0 issues pass.
- `snapcase.ai` transactional email is live through the `hello@snapcase.ai`
  Resend workspace, with separate production/staging keys, signed replay-safe
  webhooks, Supabase Auth SMTP, and Microsoft 365 inbound routing preserved.
- Dependency audits are clean, GitHub Actions use Node 24-compatible releases,
  and local Vite development is patched and loopback-only by default.
- Current pilot evidence and operating detail live in `Docs/ONSHORE_PILOT.md`,
  `Docs/PRODUCTION_ROADMAP.md`, and `Docs/PRODUCTION_CUTOVER_RUNBOOK.md`.
  Decisions live in `Docs/DECISIONS.md`; older status snapshots remain
  discoverable through git history.
- On 2026-08-26 Alejandro reported, "The test printed out normally," for the
  existing device-689 deferred-print order. That observation closes the physical
  printer test, but it does not by itself authorize production shipping.
