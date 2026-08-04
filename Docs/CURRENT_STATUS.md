# Current Status

Owner-updated snapshot for AI agents. GitHub Issues is the operational source
of truth; `Docs/DECISIONS.md` remains authoritative for recorded decisions.

**Last updated:** 2026-08-04
**Last updated by:** Codex
**MVP target:** Controlled production-ready pilot
**Sprint goal:** Prove the order-to-physical-case identity chain and finish the
remaining supervised onshore-pilot gates.

## Blockers

- #148 must prove an auditable identity chain from Snapcase order to Kexiaozhan
  job, physical case, and shipping label. It blocks the final `/operations`
  workflow (#116), Alejandro dry run (#117), and production pilot (#32).
- Alejandro must provide the measured packed-case dimensions and weight,
  confirm the usable label-printer format (#122), and complete the supervised
  physical release evidence (#35).

## Top 3 Next Tasks

1. P0 #148: map the observed identifier chain, run the three-same-model UAT,
   and approve the normal, quarantine, and concurrency workflow.
2. P0 #150: test the synthetic production-email prototype with Alejandro and
   feed the evidence and limitations into #148.
3. P0 #122: finalize the measured package, origin/return profile, live-rate
   policy, label format, and sample-printer evidence.

## Now / Next / Later

**Now**

- Execute the #148 identity discovery and the bounded #150 synthetic email
  prototype; do not implement assumptions as production workflow.

**Next**

- Complete #122 physical shipping inputs, then rewrite and implement #116 from
  the approved #148 workflow and validate it through #117.

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
