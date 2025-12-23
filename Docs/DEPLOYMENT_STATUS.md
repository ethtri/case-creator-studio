# Deployment Status (Vercel + Supabase)

Single place to track production readiness and cutover.

**Last updated:** 2025-12-23

## Goal
Vercel + Supabase is the canonical production pipeline.

## Vercel
- [x] Project created and linked to this repo
- [x] `VITE_SUPABASE_URL` set in Vercel
- [x] `VITE_SUPABASE_PUBLISHABLE_KEY` set in Vercel
- [x] Production deploy succeeds
- [ ] Preview deploys succeed

## Supabase (Edge Functions + CORS)
- [x] Functions deployed (`edm-nonce`, `edm-mockup`, `create-checkout`, `lookup-orders`, `verify-payment`, `submit-printful-order`, `printful-retry`)
- [x] `printful-retry` scheduled (cron `*/5 * * * *`)
- [x] CORS allowlist includes Vercel domain
- [x] Service role key configured for functions
- [x] Printful API key configured for functions
- [x] Stripe secret key configured for functions
- [x] Stripe webhook endpoint configured (live) and secret set in Supabase

## Domain (Optional)
- [x] Custom domain connected in Vercel
- [x] Domain added to Supabase CORS

## Validation
- [ ] Run `Docs/QA_SMOKE_TEST_CHECKLIST.md`
- [ ] No critical errors in Vercel/Supabase logs during test

## Cutover Decision
- [x] Production traffic pointed to Vercel URL
