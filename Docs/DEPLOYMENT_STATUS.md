# Deployment Status (Vercel + Supabase)

Single place to track cutover from Lovable to owned infra.

**Last updated:** 2025-12-22

## Goal
Vercel + Supabase is the canonical production pipeline. Lovable is optional only.

## Vercel
- [ ] Project created and linked to this repo
- [ ] `VITE_SUPABASE_URL` set in Vercel
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` set in Vercel
- [ ] Production deploy succeeds
- [ ] Preview deploys succeed

## Supabase (Edge Functions + CORS)
- [ ] Functions deployed (`edm-nonce`, `edm-mockup`, `submit-printful-order`, any others)
- [ ] CORS allowlist includes Vercel domain
- [ ] Service role key configured for functions
- [ ] Printful API key configured for functions
- [ ] Stripe secret key configured for functions

## Domain (Optional)
- [ ] Custom domain connected in Vercel
- [ ] Domain added to Supabase CORS

## Validation
- [ ] Run `Docs/QA_SMOKE_TEST_CHECKLIST.md`
- [ ] No critical errors in Vercel/Supabase logs during test

## Cutover Decision
- [ ] Disable Lovable publish or stop using it for deploys
- [ ] Production traffic pointed to Vercel URL
