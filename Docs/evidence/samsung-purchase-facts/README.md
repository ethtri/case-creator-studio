# Samsung purchase facts — draft verification

Website issue: [#336](https://github.com/ethtri/case-creator-studio/issues/336).
Agency coordination: [#423 claim](https://github.com/ethtri/Snapcase_Autonomous_MarketingAgency/issues/423#issuecomment-5981461705).
Source ID: `samsung_purchase_facts_20261004`. Authority:
`authority_20260720_zero_spend_marketing` and explicit user implementation direction.
User boundary: draft PR only; no merge or deployment. This is information-gap
remediation, not evidence of conversion lift.

## Source verification (2026-10-04)

- Baseline: `f59973d6fc62f03a3330b5889546083da7752e1e`.
- `src/data/phoneVariants.ts`: S24 Ultra/+/S24 use USD and the shared default
  product price. `supabase/functions/_shared/catalog-pricing.ts` defines 2999
  cents; server checkout uses that source too. Reuse `formatProductPrice` and
  display named prices if the Samsung models' prices ever diverge.
- Public [catalog](https://www.snapcase.ai/catalog), [S24](https://www.snapcase.ai/phone-cases/galaxy-s24),
  [S24+](https://www.snapcase.ai/phone-cases/galaxy-s24-plus) and
  [Ultra](https://www.snapcase.ai/phone-cases/galaxy-s24-ultra) readback corroborates
  $29.99 USD. The web tool's S24 product cache was five days old; its current
  catalog readback separately confirmed the S24 price.
- `src/pages/Terms.tsx` states shipping is shown before payment and production
  time varies. No fixed shipping rate, transit, refund or protection promise was
  added. Public `/terms` text extraction was empty; policy verification used
  current-main source and local rendered Terms navigation.
- `src/pages/DesignEditorEDM.tsx` and `src/pages/Preview.tsx` implement preview
  before cart. `src/lib/email-identities.ts` supplies `support@snapcase.ai`.
- Independent reviewer passed exact implementation commit
  `e28279968741f4180cd789968a4daf33cf17ad8d`, with no concrete defects.

## Rendered evidence

Screenshots show local Chromium, baseline main versus the reviewed implementation.
No physical device result is claimed. Local fixture values and network interception
prevented production service calls during the focused browser check.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 × 1000 desktop | [Hero](before-desktop.png) | [Hero](after-desktop.png) |
| 390 × 844 mobile emulation | [Hero](before-mobile.png) | [Hero](after-mobile.png) |

The mobile images capture the whole hero, extending below one viewport.
Visual inspection confirmed readable wrapping and purchase information beside the
CTA group. Both viewport checks found no horizontal overflow, no uncaught browser
errors, and no axe violations in the hero. Support and Terms links were keyboard
reachable and at least 44px tall; Terms navigation succeeded. Each model CTA
reached its original `/design/galaxy-s24...` destination with one `select_item`
and one `primary_cta_click` at `seo_landing_hero_models`. Original links and
title/description/canonical were compared with the baseline and remained exact.

Focused command: `node output/playwright/samsung-purchase-facts-check.mjs before`
then `node output/playwright/samsung-purchase-facts-check.mjs after`. The one-off
harness and detailed JSON/logs remain in the task workspace; the existing full
smoke suite also covers Samsung metadata, navigation and analytics.

## Checks

- `npm ci --no-fund --no-audit`: passed, 335 packages.
- `npm run lint --if-present`: passed.
- `npm run type-check`: passed.
- `npm run build`: passed; 18 merchant routes, 26 canonical SEO routes, and
  performance budgets passed.
- `npm test --if-present`: passed, 335 tests plus 13 lifecycle pretests.
- `npm run claims:check`: passed, 157 public source/built files.
- `npm run test:a11y`: passed; production CSS compatibility and all audited
  browser states passed. Uses fixture checkout/editor behavior, not transactions.
- `npm run audit:production` and `npm run audit`: passed high/critical gates;
  two existing moderate React Router advisories remain under website #290.
- `git diff --check`: passed.

No pricing, checkout, supplier, analytics, account, or credential changes. Existing
checkouts/worktrees were preserved. Only this draft branch is excluded from
automatic Vercel deployment via its exact `git.deploymentEnabled` branch key,
per [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled).
Other branch defaults remain unchanged. Any later release requires the owner's
release direction; #322 remains open for physical iPhone Chrome acceptance.
