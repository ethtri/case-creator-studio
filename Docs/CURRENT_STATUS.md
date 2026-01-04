# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2026-01-04
**Last updated by:** codex
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- None listed. Update if anything is actively blocked.

## Top 3 Next Tasks
1. P0: EDM finish selection safety: avoid hardcoding "Glossy"; derive finish (e.g., Glossy/Matte) per variant and validate with Printful catalog.

## Now / Next / Later
**Now**
- P0: EDM finish selection safety: avoid hardcoding "Glossy"; derive finish (e.g., Glossy/Matte) per variant and validate with Printful catalog.

**Next**
- None

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
