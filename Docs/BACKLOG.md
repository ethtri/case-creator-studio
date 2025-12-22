# Backlog

Short, prioritized list only. Use P0/P1/P2. Move done items to git history.

## P0 (MVP Launch)
- [x] Remove Printful references from UI copy - replace with Snapcase-first wording.
- [x] EDM error handling + fallback UX - user-friendly error state and retry, no broken flow.
- [x] Production allowlist sanity check - confirm launch domains are whitelisted for EDM.
- [x] Pre-MVP pricing rationalization - include shipping costs; target ~20% margin for MVP.
- [x] Designer mobile UX optimization - maximize EDM editor space by removing redundant text, make "Continue to preview" easier to access (floating footer/button), add a clear back-to-catalog button if the user picked the wrong case type.

## P1 (Post-Launch Soon)
- [x] EDM preview debug badge/log - surface when EDM templateId is missing on preview.
- [x] Cache Printful mockup style IDs per product/variant to reduce API chatter.

## P2 (Later)
- [x] EDM performance tuning - speed up save/preview transitions (mockup latency).
- [x] Post-MVP logging polish - audit/remove remaining production debug logs across EDM + preview flows.
- [x] Post-MVP share card branding - replace Lovable icon/banner with Snapcase assets for SMS/social previews.
- [x] Post-MVP SEO optimization - metadata, sitemap, and structured data review.
- [ ] Explore 3D mockups for variants with only a single front style.
- [ ] Accounts - login to save designs and view history.
- [ ] Catalog thumbnails - replace generic images with standardized variant icons.
