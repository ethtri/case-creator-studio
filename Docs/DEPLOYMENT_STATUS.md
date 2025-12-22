# Deployment Status (Vercel + Supabase)

Single place to track cutover from Lovable to owned infra.

**Last updated:** 2025-12-22

## Goal
Vercel + Supabase is the canonical production pipeline. Lovable is optional only.

## Vercel
- [x] Project created and linked to this repo
- [x] `VITE_SUPABASE_URL` set in Vercel
- [x] `VITE_SUPABASE_PUBLISHABLE_KEY` set in Vercel
- [x] Production deploy succeeds
- [ ] Preview deploys succeed

## Supabase (Edge Functions + CORS)
- [x] Functions deployed (`edm-nonce`, `edm-mockup`, `create-checkout`, `lookup-orders`, `verify-payment`, `submit-printful-order`, any others)
- [x] CORS allowlist includes Vercel domain
- [ ] Service role key configured for functions
- [ ] Printful API key configured for functions
- [ ] Stripe secret key configured for functions

## Domain (Optional)
- [x] Custom domain connected in Vercel
- [x] Domain added to Supabase CORS

## Validation
- [ ] Run `Docs/QA_SMOKE_TEST_CHECKLIST.md`
- [ ] No critical errors in Vercel/Supabase logs during test

## Cutover Decision
- [ ] Disable Lovable publish or stop using it for deploys
- [x] Production traffic pointed to Vercel URL
