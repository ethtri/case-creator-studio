# MVP Scope

Single source of truth for launch scope. Keep changes explicit.

**Last updated:** 2025-12-24

## In Scope (MVP)
- EDM-first editor flow for phone cases
- Preview generation via Printful mockups
- Cart and checkout flow
- Stripe test-mode payments
- Order submission to Printful (happy path)
- Accounts (email/password + OAuth), saved designs, and order history

## Out of Scope (Post-MVP)
- 3D mockups beyond available Printful styles
- Advanced catalog thumbnails and asset library
- Performance tuning beyond basic stability fixes

## Must-Not-Break Flows
- Editor -> Preview -> Cart -> Checkout -> Order confirmation
- Pricing consistency across cart, Stripe, and order records
- Supabase functions for EDM nonce + mockup generation

## Definition of Done (MVP)
- All P0 items in `Docs/BACKLOG.md` completed
- QA smoke test passes end-to-end
- No critical errors in logs during the smoke test
