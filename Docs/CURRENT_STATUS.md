# Current Status

Owner-updated snapshot for AI agents. Keep this short and current.

**Last updated:** 2025-12-24
**Last updated by:** ethtr
**MVP target:** This week  
**Sprint goal:** Stabilize EDM-first flow through checkout

## Blockers
- None listed. Update if anything is actively blocked.

## Top 3 Next Tasks
1. P0: Fix automatic Printful submission after Stripe webhook (no manual trigger) - ensure checkout.session.completed invokes submit-printful-order, writes printful_order_id/printful_status, and transitions status to processing.
2. P0: Confirm Printful orders auto-confirm (not draft) after adding confirm=true - run live checkout and verify status in Printful + Supabase.
3. P0: Clean up test artifacts - refund live Stripe test charges and cancel or archive draft Printful orders created during validation.

## Now / Next / Later
**Now**
- P0: Fix automatic Printful submission after Stripe webhook (no manual trigger) - ensure checkout.session.completed invokes submit-printful-order, writes printful_order_id/printful_status, and transitions status to processing.

**Next**
- P0: Confirm Printful orders auto-confirm (not draft) after adding confirm=true - run live checkout and verify status in Printful + Supabase.
- P0: Clean up test artifacts - refund live Stripe test charges and cancel or archive draft Printful orders created during validation.

**Later**
- None

## Notes
- Use `Docs/BACKLOG.md` for priorities.
- Run `Docs/QA_SMOKE_TEST_CHECKLIST.md` before go-live.
