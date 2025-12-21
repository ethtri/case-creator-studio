# Printful EDM Iframe Research
**Audience:** AI coding agents  
**Purpose:** Technical reference for Printful EDM integration patterns and API structures  
**Last Updated:** 2025-01-XX (Based on Printful API v2-beta documentation)

## Key Corrections & Important Notes

### Critical Corrections Made:
1. **Nonce Response Schema:** `template_id` is at `result.template_id` (NOT nested under `result.nonce`)
2. **Save Methods:** Only `saveDesign` event is valid - `saveTemplate` is NOT a recognized event
3. **Auto-Save:** EDM does NOT auto-save - must implement via `onDesignStatusUpdate` callback
4. **Auto-Save Pattern:** Use `designChange` + `designValid` (not just `hasDesign`) for accurate change detection

### Important Implementation Notes:
- **External Product ID:** Must be unique per design instance, stable for restoration
- **Template Loading:** Use `GET /product-templates/@{external_product_id}` to retrieve by external ID
- **Template Thumbnails:** No direct API endpoint - must use Mockup Generator API
- **Nonce Invalidation:** Saving template invalidates nonce - new nonce required for further edits

## Product Selection Handoff

**Status:** Implemented

**Pattern:**
- Route parameter: `/design-edm/:variantId`
- Fetch variant: `getVariantById(variantId)`
- Initialize EDM with `initProduct`:
  ```typescript
  initProduct: {
    productId: number,  // 683 for iPhone, 684 for Samsung
    variantIds: [variant.printfulVariantId],
    technique: "SUBLIMATION"
  }
  ```

**Result:** EDM opens with product pre-selected.

## Product Tab Visibility Control

**Status:** Partially possible

**Available Options:**
- `isVariantSelectionDisabled: true` - Disables variant selection UI
- `steps: ['design']` - Limits navigation to Design step only
- `allowOnlyOneColorToBeSelected: true` - Restricts color selection
- `allowOnlyOneSizeToBeSelected: true` - Restricts size selection

**Limitations:**
- No official API option to hide Product tab
- CSS injection blocked by cross-origin restrictions
- Tab remains visible but non-functional with above options

**Current Implementation:**
```typescript
{
  isVariantSelectionDisabled: true,
  allowOnlyOneColorToBeSelected: true,
  allowOnlyOneSizeToBeSelected: true,
  preselectedSizes: [String(variant.printfulVariantId), variant.model],
  steps: ['design']
}
```

## Design Persistence Architecture

**Pattern:** `designId` → `external_product_id` → `template_id`

**Data Flow:**
1. Generate unique `designId` (UUID) per design instance
2. Map `designId` to `external_product_id` in sessionStorage
3. Request nonce with `external_product_id`
4. Printful returns `template_id` if design exists
5. Store `template_id` per `designId` in sessionStorage

**SessionStorage Keys:**
- `edmDesign:{designId}:externalProductId` - External product ID
- `edmDesign:{designId}:templateId` - Printful template ID
- `edmDesign:{designId}:variantId` - Variant ID
- `edmDesign:{designId}:preview` - Preview image URL (optional)
- `edmDesign:last` - Last active design ID

**Restoration Logic:**
- If nonce returns `template_id`: Skip `initProduct`, EDM loads existing design
- If no `template_id`: Include `initProduct` to create new design

## Nonce API Response Structure

**Endpoint:** `POST https://api.printful.com/embedded-designer/nonces`

**Request:**
```json
{
  "external_product_id": "snapcase-{designId}-{timestamp}",
  "external_customer_id": "string | null",  // Optional
  "ip_address": "string | null",            // Optional
  "user_agent": "string | null"             // Optional
}
```

**Response Structure (Official Schema):**
```json
{
  "code": 200,
  "result": {
    "nonce": "string",
    "template_id": integer | null,
    "expires_at": integer
  }
}
```

**Key Points:**
- `template_id` is located at `result.template_id` (NOT nested under `result.nonce`)
- `nonce` is a string at `result.nonce` (NOT an object)
- `template_id` is `null` if no template exists for the `external_product_id`
- `expires_at` is a UNIX timestamp (integer)

**Current Implementation Status:**
The `edm-nonce/index.ts` function correctly handles both possible response structures (defensive programming):
```typescript
const rawNonce = data.result?.nonce;
const nonceValue = typeof rawNonce === "string" ? rawNonce : rawNonce?.nonce;
const templateId =
  typeof rawNonce === "object" && rawNonce
    ? rawNonce.template_id
    : data.result?.template_id;
```

**Edge Function Response:**
```typescript
{
  nonce: string,           // Extracted nonce value
  templateId: number | null,  // Template ID if exists, null otherwise
  expiresAt: number        // Expiration timestamp
}
```

**References:**
- [Printful EDM Documentation - Nonce Generation](https://developers.printful.com/docs/edm/)

## EDM Initialization Patterns

**New Design (when template_id is null):**
```typescript
new PFDesignMaker({
  elemId: 'printful-designer',
  nonce: nonceValue,
  externalProductId: externalProductId,
  initProduct: {
    productId: number,
    technique: "SUBLIMATION",
    variantIds: [variantId]
  },
  steps: ['design'],
  isVariantSelectionDisabled: true
})
```

**Restore Existing Design (when template_id exists):**
```typescript
new PFDesignMaker({
  elemId: 'printful-designer',
  nonce: nonceValue,
  externalProductId: externalProductId,
  // Omit initProduct entirely when template_id exists
  // EDM will automatically load the existing template
  steps: ['design'],
  isVariantSelectionDisabled: true
})
```

**Required Fields:**
- `elemId`: DOM element ID for iframe container
- `nonce`: Nonce token from `/embedded-designer/nonces` endpoint
- `externalProductId`: Your unique identifier for the design

**Conditional Fields:**
- `initProduct`: Only include when creating a NEW design (template_id is null)
- All other fields are optional configuration

**References:**
- [Printful EDM Documentation - Editing Existing Templates](https://developers.printful.com/docs/edm/)

## Multiple Designs Per Variant

**Requirement:** Support multiple designs for same variant in cart

**Solution:**
- Each design gets unique `designId` (UUID)
- Each `designId` maps to unique `external_product_id`
- Cart items include `designId` and `template_id`
- Edit links include `?designId={designId}` query parameter

**Cart Item Structure:**
```typescript
interface CartItem {
  id: string;  // Use designId, not variant.id
  variant: PhoneVariant;
  designPreview: string;
  edmTemplateId?: number;
  quantity: number;
}
```

**Navigation Pattern:**
- Create: `/design-edm/:variantId?designId={newId}`
- Edit: `/design-edm/:variantId?designId={existingId}`
- Preview: `/preview/:variantId?designId={designId}`

## Mockup Generation

**API Endpoint:** `POST https://api.printful.com/v2/mockup-tasks`

**Request:**
```json
{
  "format": "jpg",
  "mockup_width_px": 1000,
  "products": [{
    "source": "template",
    "template_id": 123456,
    "mockup_style_ids": [1115],
    "catalog_variant_ids": [variantId]
  }]
}
```

**Response:**
```json
{
  "result": {
    "task_id": "string"
  }
}
```

**Polling Endpoint:** `GET https://api.printful.com/v2/mockup-tasks/{task_id}`

**Status Values:**
- `pending` - Generation in progress
- `completed` - Ready, `result.mockups[0].mockup_url` available
- `failed` - Generation failed

**Implementation Notes:**
- Async process (5-30 seconds typical)
- Requires 2-3 API calls (create task, poll, retrieve)
- Cache preview URLs by `template_id` in sessionStorage
- Provide fallback placeholder during generation
- Handle rate limits and timeouts

## Auto-Save Pattern

**Important:** EDM does NOT auto-save by default. All saves must be explicitly triggered.

**Recommended Pattern:** Use `onDesignStatusUpdate` callback to detect changes and trigger saves programmatically.

**Callback Properties:**
- `designChange` (Boolean): Indicates if design has been modified since opened
- `designValid` (Boolean): Shows whether current design can be saved
- `hasDesign` (Boolean): Indicates if design has any content
- `selectedVariantIds` (Array): Selected product variant IDs
- `usedPlacements` (Array): IDs of placements with designs
- `subtechnique` (String): Active sub-technique
- `errors` (Array): Error messages if design is invalid

**Callback Behavior:**
- Debounced with 1000ms delay (triggers 1000ms after last change)
- Fires on design modifications, validation errors, size/color changes, placement changes

**Recommended Implementation:**
```typescript
onDesignStatusUpdate: (status) => {
  // Only save if design changed AND is valid
  if (status.designChange && status.designValid && !autoSaveInFlightRef.current) {
    autoSaveInFlightRef.current = true;
    designMakerRef.current?.sendMessage({ event: 'saveDesign' });
  }
}
```

**Current Implementation Note:**
The code at `DesignEditorEDM.tsx:266-271` uses `status.hasDesign` instead of `status.designChange`. Consider updating to use `designChange` for more accurate change detection.

**Considerations:**
- Track `autoSaveInFlightRef` to prevent duplicate saves
- Update `templateIdRef` on `onTemplateSaved` callback
- Add debounce delay (2-3 seconds) after first change to avoid premature saves
- Only save when `designValid` is `true` to avoid saving invalid designs

**References:**
- [Printful EDM Documentation - onDesignStatusUpdate](https://developers.printful.com/docs/edm/)

## URL Parameter Strategy

**DesignId in Query String:**
- Required for "Edit design" functionality
- Format: `?designId={uuid}`
- URL-encode for safety
- Store in sessionStorage for persistence

**Implementation:**
```typescript
const [searchParams, setSearchParams] = useSearchParams();
const designId = searchParams.get("designId") || generateDesignId();

// On new design:
setSearchParams({ designId: newDesignId }, { replace: true });

// On navigation:
navigate(`/preview/${variantId}?designId=${designId}`);
```

## Error Handling Requirements

**Nonce API:**
- Validate `nonce` exists before EDM init
- Handle missing `template_id` (null = new design)
- Retry on network failures

**Mockup Generation:**
- Retry logic (max 3 attempts)
- Timeout handling (30 seconds max)
- Fallback placeholder image
- Error state UI

**EDM Initialization:**
- Validate `variant` and `PFDesignMaker` available
- Handle script load failures
- Timeout after 10 seconds if script doesn't load

## File Locations

**EDM Editor:** `src/pages/DesignEditorEDM.tsx`
**Nonce Function:** `supabase/functions/edm-nonce/index.ts`
**Cart Context:** `src/contexts/CartContext.tsx`
**Preview Page:** `src/pages/Preview.tsx`
**Checkout:** `supabase/functions/create-checkout/index.ts`

## API References

- [Printful EDM Documentation](https://developers.printful.com/docs/edm/)
- [Nonce API](https://developers.printful.com/docs/edm/#nonce-generation)
- [Mockup Generator API](https://developers.printful.com/docs/v2-beta/#tag/Mockup-Generator)
- [Product Templates API](https://developers.printful.com/docs/v2-beta/#tag/Product-Templates)

## Save Design Methods

**Correct Method:**
```typescript
designMaker.sendMessage({ event: 'saveDesign' });
```

**Invalid Method (DO NOT USE):**
```typescript
designMaker.sendMessage({ event: 'saveTemplate' });  // ❌ Not a valid event
designMaker.sendMessage({ action: 'saveDesign' });  // ⚠️ Use 'event' not 'action'
```

**Save Confirmation:**
- `onTemplateSaved(templateId: number)` callback fires when save completes
- Fires for both user-initiated and programmatic saves
- Template ID is provided in callback parameter

**Current Implementation Issue:**
The code at `DesignEditorEDM.tsx:400-401` uses both:
```typescript
designMakerRef.current.sendMessage({ action: 'saveDesign' });
designMakerRef.current.sendMessage({ event: 'saveTemplate' });
```

**Recommendation:** Remove `saveTemplate` call and use only:
```typescript
designMakerRef.current.sendMessage({ event: 'saveDesign' });
```

**References:**
- [Printful EDM Documentation](https://developers.printful.com/docs/edm/)

## Template Loading & Retrieval

**By Template ID:**
```
GET /product-templates/{template_id}
```

**By External Product ID:**
```
GET /product-templates/@{external_product_id}
```
(Note: Prefix external_product_id with `@` symbol)

**Template Operations:**
- **Duplicate:** `POST /product-templates/{product_template_id}/duplicate`
- **Swap Product:** `POST /product-templates/{product_template_id}/swap-product`

**Template Thumbnails:**
- No direct API endpoint for template thumbnails
- Must use Mockup Generator API to generate preview images
- Thumbnails available in Printful Dashboard (Product templates → Download mockups)

**References:**
- [Printful API Documentation - Product Templates](https://developers.printful.com/docs/v2-beta/#tag/Product-Templates)

## External Product ID Best Practices

**Critical Rules:**
1. **Must be unique per design instance** (not per variant)
2. **Must be stable** - reuse same ID to restore same design
3. **Must not be reused** across different designs (will overwrite previous template)

**Recommended Format:**
- `{platform}-{designId}` - Best for multiple designs per variant
- `{platform}-{variantId}-{userId}-{sessionId}` - For session-based designs
- Avoid timestamps in ID if you want persistence

**Pitfalls:**
- Reusing same `external_product_id` for different designs overwrites previous template
- Non-unique IDs can cause synchronization errors
- Changing IDs prevents design restoration

**References:**
- [Printful Help Center - Product Variants](https://help.printful.com/hc/en-us/articles/21264043816476-How-do-I-sync-different-product-variants-with-different-designs-on-Printful)

## Known Issues

1. **Save Method:** Code uses invalid `saveTemplate` event - should use only `saveDesign`
2. **Auto-Save Trigger:** Uses `hasDesign` instead of `designChange` - less accurate change detection
3. **Cart ID Generation:** Currently uses `${variant.id}-${Date.now()}` which can collide; should use UUID like `designId`
4. **SessionStorage Cleanup:** No cleanup strategy for old designs (consider 24-hour TTL)

## Validation Checklist

- [x] Multiple designs for same variant in cart - Feasible
- [x] Edit design restores correct instance - Feasible (with designId in URL)
- [x] Session persistence - Feasible (with proper external_product_id reuse)
- [x] Instant "Continue to preview" - Feasible (with fallback preview)
- [ ] Mockup generation reliability - Needs retry/timeout handling
- [ ] Remove invalid `saveTemplate` event call - Code cleanup needed
- [ ] Update auto-save to use `designChange` instead of `hasDesign` - Improvement

