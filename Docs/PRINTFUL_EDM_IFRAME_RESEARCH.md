# Printful EDM Iframe Research
**Date:** 2025-01-XX  
**Purpose:** UI/UX research on product handoff and tab visibility  
**Audience:** Engineering & Product

## Question 1: Carry over the selected product to the EDM iframe

**Answer:** Already implemented.

**How it works**
- The variant ID comes from the route (`/design-edm/:variantId`).
- Variant data is fetched using `getVariantById(variantId)`.
- The product is initialized via `initProduct` in the EDM config:
  - `productId` for the base product
  - `variantIds: [variant.printfulVariantId]` for the selected SKU

**Result:** The EDM iframe opens with the correct product pre-selected.

## Question 2: Block or hide the "Product" tab

**Answer:** Partially possible.

**Findings**
- There is no official config to hide the Product tab.
- You can disable variant selection using `isVariantSelectionDisabled: true`.
- CSS injection into the iframe is fragile and may be blocked by cross-origin restrictions.

**Recommended implementation**
- Use `isVariantSelectionDisabled: true` to prevent product changes.
- Use `steps: ['design']` to keep the user on the Design step only.
- Leave the tab visible but non-functional.

**Optional next steps**
- Inspect the iframe DOM to identify selectors for the Product tab.
- Test CSS injection (may be blocked by CORS).
- Ask Printful support for an official tab-hiding feature.

## References
- `src/pages/DesignEditorEDM.tsx` (EDM initialization)

## Progress Notes

- 2025-01-XX: EDM init now includes `technique: "SUBLIMATION"`, `steps: ["design"]`,
  `isVariantSelectionDisabled`, `allowOnlyOneSizeToBeSelected`, and `preselectedSizes`
  to keep the selected variant locked and the editor focused on the design step.
