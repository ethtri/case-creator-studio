# Decisions

Lightweight record of key decisions for AI agents.

## 2025-12-22
- EDM is the primary editor; Fabric.js editor is archived.
- Preview images come from Printful mockup generation tasks.
- Stripe is used for checkout and payment processing.
- Supabase Edge Functions handle EDM nonce + mockup calls.

## 2026-05-03
- Printful remains the production fulfillment default while the onshore pilot is validated.
- Onshore v1 is Snapcase site orders only, paid through Stripe, and routed to a manual internal production queue.
- Kexiazhan machine automation is deferred until file upload, prepaid/internal payment, machine targeting, and failure-state behavior are confirmed.
- `onshore_manual` requires both `FULFILLMENT_PROVIDER=onshore_manual` and `ALLOW_ONSHORE_MANUAL=true`; production should keep the allow flag unset until a controlled pilot is approved.
- The tokenized Kexiaozhan/Xiaojiang URL is operator-only and must not become a public CTA. The preferred research target is vendor designer output feeding back into Snapcase-owned Stripe checkout and onshore queue.
