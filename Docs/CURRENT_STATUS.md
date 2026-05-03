# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2026-05-03
**Last updated by:** ethtr
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- Physical manual-production dry run remains: print/pack/ship a real test case from the staging queue process before production pilot.

## Top 3 Next Tasks
1. P0: Manual production dry run - use the queued staging onshore job to print/pack/ship manually, then verify status/tracking updates.
2. P0: Vendor validation for onshore automation - confirm `filePath` creation, prepaid/internal payment handling, machine targeting, artwork requirements, SKU/material mapping, and failure states.

## Now / Next / Later
**Now**
- P0: Manual production dry run - use the queued staging onshore job to print/pack/ship manually, then verify status/tracking updates.

**Next**
- P0: Vendor validation for onshore automation - confirm `filePath` creation, prepaid/internal payment handling, machine targeting, artwork requirements, SKU/material mapping, and failure states.

**Later**
- None

## Notes
- Use `Docs/BACKLOG.md` for priorities.
- Run `Docs/QA_SMOKE_TEST_CHECKLIST.md` before go-live.
- QA smoke test: PASS (live-mode order; test-mode run skipped per owner).
- SEO: pre-rendered `/` and `/catalog` with indexable HTML; app routes use noindex fallback.
- Promo codes: pre-checkout apply with Stripe validation; enforce eligibility at checkout.
- UAT: cart persists after Stripe cancel; My Orders thumbnails restored.
- UAT: multi-item checkout metadata limit handled.
- Onshore staging: Stripe sandbox checkout, webhook routing, duplicate replay, operator allowlist/update, tracking, and provider rollback smoke passed.
- Onshore staging: owner dry-run job `a059d2eb-3ada-4dd5-8f32-a4fa88e1a873` is queued from paid Stripe test order `d89cfec5-d190-4209-aff5-c017c22225c6`; duplicate routing reused the same job.
