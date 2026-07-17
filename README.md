# Snapcase App V2

A modern phone case customization platform built with React, TypeScript, and Supabase.

## Quick Start

```bash
# Install dependencies
npm ci

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Start development server
npm run dev
```

Visit http://localhost:8080

## Documentation (AI agents start here)

- `AGENTS.md` - Guardrails, workflow, and DoD
- `Docs/README.md` - Canonical docs index

Core docs:
- `Docs/CURRENT_STATUS.md` - Current priorities and status
- `Docs/MVP_SCOPE.md` - MVP scope and DoD
- `Docs/BACKLOG.md` - P0/P1/P2 backlog
- `Docs/QA_SMOKE_TEST_CHECKLIST.md` - Smoke test steps
- `Docs/DECISIONS.md` - Key decisions
- `Docs/PRINTFUL_NOTES.md` - Printful integration notes
- `Docs/DEPLOYMENT_STATUS.md` - Cutover checklist
- `Docs/VERCEL_SETUP_STEPS.md` - Vercel setup guide

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS
- **Backend**: Supabase (Database, Auth, Edge Functions)
- **Integrations**: Printful (Fulfillment), Stripe (Payments)
- **State Management**: React Query, Context API

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Check code quality
npm run lint:fix     # Auto-fix linting issues
npm run type-check   # Check TypeScript types
npm run check        # Run all quality checks
npm run claims:check # Block unapproved public origin, delivery, material, and remedy claims
npm run audit        # Check for security vulnerabilities
```

## Environment Variables

Required environment variables (see `.env.example`):

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend)
- `PRINTFUL_API_KEY` - Printful API key
- `STRIPE_SECRET_KEY` - Stripe secret key

Never commit `.env` files to version control.
