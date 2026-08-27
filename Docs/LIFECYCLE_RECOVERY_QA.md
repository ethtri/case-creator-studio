# Lifecycle Recovery QA Evidence

Date: 2026-08-27

Branch: `agent/agency-saved-cart-recovery-267`

Website issue: `case-creator-studio#267`

Marketing source: `Snapcase_Autonomous_MarketingAgency#389`

## Safety boundary

All automated and rendered checks used reserved-invalid URLs, in-memory network
mocks, or categorical state fixtures. No real subscriber, email address,
artwork, token, cart, order, provider, or production database row was used. No
message was sent, no Stripe object was created, and spend was `$0`.

## Automated verification

- `npm ci`: passed; the branch inherited two moderate development-dependency
  advisories and did not apply an unrelated broad update.
- Focused Node contract: 13 passed.
- Focused Deno contract: 4 passed.
- Full repository tests: 289 passed, plus the 13-test recovery pretest.
- ESLint: passed.
- TypeScript: passed.
- Production build, 18-route merchant catalog, 26-route SEO, responsive-media,
  route-splitting, and performance budgets: passed.
- Public claims check: passed across 120 source and built files.
- PostgreSQL parser: the generated migration parsed as 51 PostgreSQL statements.
- Remote current-schema lint: no schema errors.
- Remote security advisor: no new recovery schema was applied; five pre-existing
  warnings remain (public `pg_net`, executable legacy `handle_new_user`, leaked
  password protection, and MFA configuration). Recovery functions explicitly
  revoke `PUBLIC`, `anon`, and `authenticated` execution.

## Rendered browser matrix

The machine-readable evidence is
`Docs/evidence/lifecycle-recovery/browser-matrix.json`.

- Desktop 1440×1000: saved-design success and every material failure/missing
  state rendered with named headings, actions, no horizontal overflow, and no
  token remaining in the address bar.
- Mobile 390×844: repriced-cart success and every material failure/missing state
  passed the same checks.
- Material states: expired, revoked, already purchased, deleted, unavailable
  model, stale revision, invalid, already used, generic failure, and missing.
- The analytics-consent banner initially obscured the mobile restore action.
  The action order and mobile safe space were changed, then the 390×844 flow was
  rerun; Restore cart and Open My Designs are now reachable before a consent
  decision.
- Design restore navigated to the intended model/design and restored the exact
  template state. Cart restore replaced the cart only after validation,
  preserved quantity two, used the current `$29.99` unit price, and navigated to
  the repriced checkout state.

## Database verification boundary

The local Supabase stack could not start because the Docker Desktop engine pipe
was unavailable and the current process could not start the privileged Docker
service. A read-only remote dry run connected successfully and included the new
migration, but also proved the production migration history is missing fourteen
older repository migrations. Therefore this PR must not apply only the recovery
migration to production or use `--include-all` casually. Deployment remains a
separate, fail-closed reconciliation step after the repository/remote migration
history is reviewed.

## Rollback

Disable the `lifecycle-recovery` Edge function and recovery-outbox claiming,
revoke active recovery tokens, and preserve consent, suppression, purchase,
order, and redacted audit state. The provider and live-send flags remain
disabled throughout this change.
