# Documentation Index

This folder contains the canonical project docs. Older or redundant material lives in `archive/`.

## Start Here (AI agents)
- [AGENTS.md](../AGENTS.md) - Guardrails, workflow, and DoD (canonical)
- [CURRENT_STATUS.md](./CURRENT_STATUS.md) - Where things stand right now
- [MVP_SCOPE.md](./MVP_SCOPE.md) - What is in/out for launch
- [BACKLOG.md](./BACKLOG.md) - P0/P1/P2 backlog
- [HYGIENE_ROUTINES.md](./HYGIENE_ROUTINES.md) - Repo hygiene routines for PRs, branches, docs, and verification
- [QA_SMOKE_TEST_CHECKLIST.md](./QA_SMOKE_TEST_CHECKLIST.md) - MVP smoke tests
- [DECISIONS.md](./DECISIONS.md) - Key project decisions
- [PRINTFUL_NOTES.md](./PRINTFUL_NOTES.md) - Printful EDM, mockups, and order notes
- [ONSHORE_PILOT.md](./ONSHORE_PILOT.md) - onshore operations pilot scope, gates, and retro log
- [VENDOR_DESIGNER_RESEARCH.md](./VENDOR_DESIGNER_RESEARCH.md) - vendor designer integration research, question pack, and recommendation
- [VENDOR_HANDOFF_CONTRACT.md](./VENDOR_HANDOFF_CONTRACT.md) - staging-only fake vendor handoff contract for Snapcase-owned checkout
- [KEXIAOZHAN_APIFOX_REFERENCE.md](./KEXIAOZHAN_APIFOX_REFERENCE.md) - Kexiaozhan API contract reference for vendor designer/payment/machine integration
- [KEXIAOZHAN_WEBHOOK_PAYMENT_GUIDE.md](./KEXIAOZHAN_WEBHOOK_PAYMENT_GUIDE.md) - latest vendor payment webhook guide, fixed `/client` endpoints, and HMAC-SHA256 signing rules
- After updating `Docs/BACKLOG.md`, run `npm run sync:status` to refresh `Docs/CURRENT_STATUS.md`.

## Deployment
- [VERCEL_SETUP_STEPS.md](./VERCEL_SETUP_STEPS.md) - Deployment steps
- [DEPLOYMENT_STATUS.md](./DEPLOYMENT_STATUS.md) - Deployment checklist

## Structure
```
Docs/
  README.md
  CURRENT_STATUS.md
  MVP_SCOPE.md
  QA_SMOKE_TEST_CHECKLIST.md
  VERCEL_SETUP_STEPS.md
  DEPLOYMENT_STATUS.md
  DECISIONS.md
  PRINTFUL_NOTES.md
  BACKLOG.md
  HYGIENE_ROUTINES.md
  VENDOR_DESIGNER_RESEARCH.md
  VENDOR_HANDOFF_CONTRACT.md
  KEXIAOZHAN_APIFOX_REFERENCE.md
  KEXIAOZHAN_WEBHOOK_PAYMENT_GUIDE.md
```
