# iPhone detail and catalog clarity — draft verification

Website issue: [#340](https://github.com/ethtri/case-creator-studio/issues/340).
Source/approval: [agency #262](https://github.com/ethtri/Snapcase_Autonomous_MarketingAgency/issues/262#issuecomment-6072948468).
Source ID: `iphone_detail_catalog_hygiene_20261009`.
Authority: `appr_20261009_iphone_catalog_clarity`, user approval October 9 at
02:18:44 UTC. Draft implementation only; no merge or deployment.

## Source and implementation

- Baseline main: `6afe10c44eee508d2a4f74e3f117924fa81b1f4c`. GitHub connector
  materialization verified all 493 blob hashes, the complete tree, and the exact
  signed commit before creating a dedicated task worktree. Four large public
  image files were obtained from the live static site and checked against their
  immutable repository blob hashes. No credentials were extracted.
- The existing CC0 `public/catalog/commons/iphone-17.jpg` was visually inspected:
  it shows the correct two-lens phone. Provenance is already recorded in
  `Docs/CATALOG_IMAGE_PROVENANCE.md`. The hero explicitly calls it a device
  reference, states the phone is not included, and directs buyers to preview the
  custom case in the designer. No claim of a finished-case photograph is made.
- `Product.image` is intentionally omitted for iPhone 17: a compatibility photo
  should not represent the case being sold. This can reduce eligibility for
  image-dependent product rich results until a verified exact-case asset exists.
  The social image uses the same exact-device reference with explicit
  compatibility/phone-not-included text in the social descriptions.
- Other models retain their existing illustration behavior and validator gates.
  The iPhone 17 exception requires the exact path, dimensions, alt text, visible
  caption, no generic mockup and no Product image claim. Negative tests cover
  wrong model, dimensions, labels, missing disclosure and JSON-LD mislabeling.
- Apple product pages reuse the Samsung preview/shipping/production copy,
  current Terms, and `SNAPCASE_EMAILS.support`. Price still comes unchanged from
  `formatProductPrice(variant)`. No materials, delivery dates or refunds promised.
- Catalog inspiration moves below the model grid. Search, brand filters,
  exact-model actions, links, content and analytics handlers are unchanged.
- `vercel.json` disables automatic deployment for this exact task branch only,
  following the existing repository pattern. Main and other branches unchanged.

## Verification

- Dependency install passed with a workspace-local npm cache. Initial default
  cache attempt failed because the runtime home directory was unavailable.
- `npm run type-check`, `npm run lint --if-present`, `npm run build`,
  `npm test --if-present`, `npm run claims:check` and `git diff --check` passed.
  Tests: 338 plus 13 lifecycle pretests. Build validates 18 merchant routes,
  26 SEO routes and existing transfer budgets.
- Focused image/merchant regression tests passed. An independent source review
  found the social disclosure gap; it was corrected before draft publication.
- Local rendered QA is blocked: Chromium failed before page creation with
  `process_singleton_posix socket() failed: Operation not permitted`. The existing
  supported cloud browser's normal localhost navigation separately returned
  `ERR_CONNECTION_REFUSED`. No sandbox changes, tunneling or alternate launch
  flags were attempted to circumvent these restrictions. No local before/after
  screenshots or physical-device results are claimed.
- Focused mocked desktop (1440×1000) and mobile (390×844) checks were added to the
  existing accessibility smoke suite: exact hero asset, disclosures, support and
  Terms focus/target sizes, Terms/Back navigation, overflow, axe, catalog ordering,
  empty/repeated filters, exact-model hrefs and the inspiration anchor. Screenshot
  outputs: `output/playwright/iphone17-clarity-{desktop,mobile}.png` and
  `output/playwright/catalog-clarity-{desktop,mobile}.png` in the normal CI artifact.
  Their execution and exact-head hosted CI result must be verified on the draft PR.
- #322 remains open for physical-phone acceptance. This draft does not establish
  real iOS/Android editor behavior, conversion lift, or production readiness.

## Risk and rollback

Image-dependent rich results and hero height are the primary review tradeoffs.
The five existing open dependency PRs do not touch these files. Broader imagery
and merchandising #69/#70 and agency CRO/CMO ownership remain unchanged. Revert
this focused patch through a reviewed PR if necessary. Release requires separate
approval and production verification; no checkout, orders, billing, supplier,
customer-data, security or job changes are part of this work.
