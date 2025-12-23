# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2025-12-23
**Last updated by:** ethtr
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- None listed. Update if anything is actively blocked.

## Top 3 Next Tasks
1. P0: Verify automatic Printful submission after Stripe webhook (no manual trigger).
2. P0: Confirm auto-confirmed Printful orders (not drafts) after confirm=true.
3. P0: Clean up test artifacts (refund Stripe live tests, cancel draft Printful orders).

## Now / Next / Later
**Now**
- P0: Verify automatic Printful submission after Stripe webhook (no manual trigger).

**Next**
- P0: Confirm auto-confirmed Printful orders (not drafts) after confirm=true.
- P0: Clean up test artifacts (refund Stripe live tests, cancel draft Printful orders).

**Later**
- P2: Explore 3D mockups for variants with only a single front style.
- P2: Accounts - login to save designs and view history.
- P2: Catalog thumbnails - replace generic images with standardized variant icons.

## Recent Completed
- Stripe live checkout now captures shipping address in Supabase orders.
- Stripe webhook + Printful v2 payload updates deployed; Printful order creation succeeds.
- Printful auto-confirm enabled for new orders.

## Notes
- Use `Docs/BACKLOG.md` for priorities.
- Run `Docs/QA_SMOKE_TEST_CHECKLIST.md` before go-live.
