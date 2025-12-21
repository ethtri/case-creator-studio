# Printful Mockup Generation Research - EDM Templates
**Date:** 2025-01-XX  
**Purpose:** Research findings for EDM template mockup generation issues (blank mockups)  
**Audience:** AI coding agents

## Executive Summary

**Issue:** EDM previews showing blank mockups when using Printful Mockup Generator API with EDM template IDs.

**Key Findings:**
1. ✅ Field name is correct: `product_template_id` (not `template_id`)
2. ✅ EDM `template_id` from `onTemplateSaved` IS the same as `product_template_id`
3. ⚠️ `mockup_style_ids` may be required for Snap Cases - currently missing from request
4. ✅ Response structure uses `catalog_variant_mockups` array
5. ⚠️ `X-PF-Store-ID` is required for account-level API tokens
6. ⚠️ Templates may need to be "confirmed" or saved properly before mockup generation

---

## 1. Field Name: `product_template_id` vs `template_id`

### Answer: Use `product_template_id`

**Correct Payload Structure:**
```json
{
  "format": "jpg",
  "mockup_width_px": 1000,
  "products": [
    {
      "source": "template",
      "product_template_id": 123456789,
      "catalog_variant_ids": [4011],
      "mockup_style_ids": [123]  // Optional but recommended
    }
  ]
}
```

**Source:** Printful OpenAPI Spec (`printful_openapi.json:7692-7733`)
- Schema: `TemplateMockupProduct`
- Required fields: `source: "template"`, `product_template_id: integer`
- Optional fields: `catalog_variant_ids`, `mockup_style_ids`

**Current Implementation Status:** ✅ CORRECT
- `edm-mockup/index.ts:85` uses `product_template_id: templateId`

**References:**
- [Printful API v2 - Mockup Generator](https://developers.printful.com/docs/v2-preview/)
- OpenAPI Spec: `TemplateMockupProduct` schema

---

## 2. EDM `template_id` vs `product_template_id` - Are They the Same?

### Answer: YES - They are the same identifier

**Evidence:**
1. **EDM Callback:** `onTemplateSaved(templateId: number)` returns a numeric ID
2. **Mockup API:** Accepts `product_template_id` as integer
3. **Direct Usage:** Printful documentation examples show using EDM template ID directly in mockup requests

**Example from Documentation:**
```javascript
// EDM saves template
onTemplateSaved: (templateId) => {
  // templateId = 712152512
  // Use directly in mockup generation:
  product_template_id: templateId  // ✅ Same ID
}
```

**No Conversion Needed:**
- ❌ No need to call `GET /product-templates/{id}` to convert
- ❌ No need to call `GET /product-templates/@{external_product_id}`
- ✅ Use EDM `template_id` directly as `product_template_id`

**Important Note:**
- EDM templates are NOT visible in Printful Dashboard
- Dashboard templates CANNOT be edited in EDM
- But both use the same ID system for mockup generation

**References:**
- [Printful EDM Documentation](https://developers.printful.com/docs/edm/)
- [Printful Mockup Generator v2](https://developers.printful.com/docs/v2-preview/)

---

## 3. Required `mockup_style_ids` for Snap Cases (Products 683/684)

### Answer: `mockup_style_ids` is OPTIONAL but may be required for proper rendering

**Current Implementation:** ❌ MISSING
- `edm-mockup/index.ts:80-89` does NOT include `mockup_style_ids`

**OpenAPI Spec Notes:**
- `mockup_style_ids` is optional in `BaseMockupProduct` schema
- **Default behavior:** "Automatically set to the first available style ID"
- **If `orientation` is specified:** Only styles matching that orientation will be considered

**How to Find Correct Style IDs:**

**API Endpoint:**
```
GET https://api.printful.com/v2/catalog-products/{product_id}/mockup-styles
```

**For Snap Cases:**
```
GET https://api.printful.com/v2/catalog-products/683/mockup-styles  # iPhone
GET https://api.printful.com/v2/catalog-products/684/mockup-styles  # Samsung
```

**Response Structure:**
```json
{
  "result": [
    {
      "style_id": 123,
      "style_name": "On White Background",
      "view_name": "Front",
      "orientation": "vertical"
    }
  ]
}
```

**Recommendation:**
1. **Query the API** to get available style IDs for products 683/684
2. **Include `mockup_style_ids`** in mockup request (even if optional)
3. **Use front-facing style** for preview (typically first style or style with `view_name: "Front"`)

**Potential Issue:**
- Blank mockups may occur if:
  - No default style is available
  - Style doesn't match template's placement
  - Template doesn't have proper design data

**References:**
- [Printful API - Retrieve Mockup Styles](https://developers.printful.com/docs/v2-beta/#operation/retrieveMockupStylesByProductId)
- OpenAPI Spec: `BaseMockupProduct.mockup_style_ids` description

---

## 4. Response Schema for `source: "template"` Mockups

### Answer: Mockups are in `catalog_variant_mockups` array

**Complete Response Schema:**
```json
{
  "result": {
    "id": 597350033,
    "status": "completed",
    "catalog_variant_mockups": [
      {
        "catalog_variant_id": 4011,
        "mockups": [
          {
            "placement": "front",
            "display_name": "Front Print",
            "technique": "sublimation",
            "style_id": 123,
            "mockup_url": "https://printful-upload.s3-accelerate.amazonaws.com/tmp/..."
          }
        ]
      }
    ],
    "failure_reasons": [],
    "_links": {
      "self": {
        "href": "https://api.printful.com/v2/mockup-tasks?id=597350033"
      }
    }
  }
}
```

**Key Points:**
1. **Status values:** `"completed"`, `"pending"`, `"failed"`
2. **Mockup location:** `result.catalog_variant_mockups[0].mockups[0].mockup_url`
3. **Multiple variants:** Each variant gets its own entry in `catalog_variant_mockups`
4. **Multiple mockups:** Each variant can have multiple mockups (different styles/placements)

**Current Implementation Status:** ✅ CORRECT
- `edm-mockup/index.ts:134-144` correctly extracts from `catalog_variant_mockups`
- Also has fallback to `result.mockups` (for catalog source)

**Note:** The response structure is the SAME whether using `source: "template"` or `source: "catalog"`. The difference is only in the request payload.

**References:**
- OpenAPI Spec: `MockupGeneratorTask` schema (lines 7545-7626)
- [Printful Mockup Generator Documentation](https://developers.printful.com/docs/v2-preview/)

---

## 5. Known Issues with EDM Template Mockup Generation

### Potential Issues:

**1. Template Not Properly Saved:**
- EDM template must be saved via `saveDesign` event
- `onTemplateSaved` callback must fire successfully
- Template ID must be valid before mockup generation

**2. Variant Mismatch:**
- `catalog_variant_ids` in mockup request must match variants defined in template
- Error: "Variant not found in template" if mismatch

**3. Missing Design Data:**
- Template must have actual design placements
- Blank template = blank mockup
- Verify template has design before generating mockup

**4. Style Compatibility:**
- `mockup_style_ids` must be valid for the product
- Some styles may not work with certain placements
- Query available styles first

**5. Template Confirmation:**
- ⚠️ **UNCONFIRMED:** Some sources suggest templates need to be "confirmed"
- No official documentation found on this
- May be related to template save completion

**6. Timing Issues:**
- Template save is async
- Wait for `onTemplateSaved` before generating mockup
- Current implementation: ✅ Waits for template ID

**Debugging Steps:**
1. Verify template ID is valid (not null/undefined)
2. Check template has design data via `GET /product-templates/{id}`
3. Verify variant IDs match template variants
4. Query available mockup styles for product
5. Check task `failure_reasons` in response

**References:**
- [Printful EDM Documentation](https://developers.printful.com/docs/edm/)
- [Printful Mockup Generator Troubleshooting](https://developers.printful.com/docs/v2-preview/)

---

## 6. `X-PF-Store-ID` Header Requirement

### Answer: REQUIRED for account-level API tokens

**When Required:**
- ✅ **Account-level API tokens** (most common)
- ❌ Store-specific API tokens (if using store-scoped token)

**Header Format:**
```
X-PF-Store-ID: 17088301
```

**Current Implementation Status:** ✅ CORRECT
- `edm-mockup/index.ts:38` includes `X-PF-Store-ID: PRINTFUL_STORE_ID`
- Store ID: `"17088301"` (hardcoded)

**How to Get Store ID:**
```
GET https://api.printful.com/stores
Authorization: Bearer {token}
```

**Response:**
```json
{
  "code": 200,
  "result": [
    {
      "id": 17088301,
      "name": "My Store",
      ...
    }
  ]
}
```

**Error if Missing:**
- API may return 400/401 error
- Error message: "Store ID required" or similar

**References:**
- [Printful API Documentation - Store ID](https://developers.printful.com/docs/v2-preview/)
- Printful documentation states: "Required if using account-level API token"

---

## Recommended Fixes

### 1. Add `mockup_style_ids` to Request

**Current Code (edm-mockup/index.ts:80-89):**
```typescript
body: JSON.stringify({
  format: "jpg",
  products: [
    {
      source: "template",
      product_template_id: templateId,
      catalog_variant_ids: [variantId],
      // ❌ Missing mockup_style_ids
    },
  ],
}),
```

**Recommended Fix:**
```typescript
// First, query available styles (cache this)
const stylesResponse = await fetch(
  `https://api.printful.com/v2/catalog-products/${productId}/mockup-styles`,
  { headers: getPrintfulHeaders(apiKey) }
);
const styles = await stylesResponse.json();
const styleId = styles.result?.[0]?.style_id; // Use first available style

body: JSON.stringify({
  format: "jpg",
  mockup_width_px: 1000,  // Also add this
  products: [
    {
      source: "template",
      product_template_id: templateId,
      catalog_variant_ids: [variantId],
      mockup_style_ids: styleId ? [styleId] : undefined,  // ✅ Add style IDs
    },
  ],
}),
```

### 2. Verify Template Before Mockup Generation

**Add Template Validation:**
```typescript
// Verify template exists and has data
const templateResponse = await fetch(
  `https://api.printful.com/v2/product-templates/${templateId}`,
  { headers: getPrintfulHeaders(apiKey) }
);
const template = await templateResponse.json();

if (!template.result || !template.result.variants?.length) {
  throw new Error("Template not found or has no variants");
}
```

### 3. Check Task Failure Reasons

**Enhanced Error Handling:**
```typescript
const result = normalizeTaskPayload(payload);
if (result?.status === "failed") {
  const reasons = result.failure_reasons || [];
  console.error("Mockup generation failed:", reasons);
  throw new Error(
    reasons.map((r: any) => r.detail || r.message).join(", ") ||
    "Mockup generation failed"
  );
}
```

### 4. Add Debug Logging

**Log Request/Response:**
```typescript
console.log("[EDM-MOCKUP] Request:", {
  templateId,
  variantId,
  productId,
  styleIds: mockup_style_ids,
});

console.log("[EDM-MOCKUP] Response:", {
  status: result?.status,
  hasMockups: !!result?.catalog_variant_mockups?.length,
  failureReasons: result?.failure_reasons,
});
```

---

## Testing Checklist

- [ ] Query mockup styles for products 683/684
- [ ] Add `mockup_style_ids` to mockup request
- [ ] Verify template exists before mockup generation
- [ ] Check `failure_reasons` in failed tasks
- [ ] Test with different style IDs
- [ ] Verify `catalog_variant_mockups` structure in response
- [ ] Confirm `X-PF-Store-ID` is being sent
- [ ] Test with valid vs invalid template IDs
- [ ] Test with templates that have no design data

---

## API Endpoints Summary

### 1. Get Mockup Styles
```
GET /v2/catalog-products/{product_id}/mockup-styles
Headers: Authorization, X-PF-Store-ID
```

### 2. Create Mockup Task
```
POST /v2/mockup-tasks
Headers: Authorization, X-PF-Store-ID, Content-Type
Body: {
  format: "jpg",
  mockup_width_px: 1000,
  products: [{
    source: "template",
    product_template_id: number,
    catalog_variant_ids: [number],
    mockup_style_ids: [number]  // Recommended
  }]
}
```

### 3. Get Task Status
```
GET /v2/mockup-tasks?id={task_id}
Headers: Authorization, X-PF-Store-ID
Response: {
  result: {
    status: "completed" | "pending" | "failed",
    catalog_variant_mockups: [...],
    failure_reasons: [...]
  }
}
```

### 4. Get Template (Validation)
```
GET /v2/product-templates/{template_id}
Headers: Authorization, X-PF-Store-ID
```

---

## References

1. [Printful Mockup Generator API v2](https://developers.printful.com/docs/v2-preview/)
2. [Printful EDM Documentation](https://developers.printful.com/docs/edm/)
3. [Printful API v2 Beta Documentation](https://developers.printful.com/docs/v2-beta/)
4. OpenAPI Spec: `printful_openapi.json` (local file)
   - `TemplateMockupProduct` schema (line 7692)
   - `MockupGeneratorTask` schema (line 7545)
   - `BaseMockupProduct` schema (line 7627)

---

## Conclusion

**Most Likely Cause of Blank Mockups:**
1. **Missing `mockup_style_ids`** - May cause default style selection to fail
2. **Template has no design data** - Blank template = blank mockup
3. **Variant mismatch** - Variant not in template
4. **Style incompatibility** - Selected style doesn't work with template

**Priority Fixes:**
1. ✅ Add `mockup_style_ids` to request (query styles first)
2. ✅ Add `mockup_width_px: 1000` for consistency
3. ✅ Verify template exists before mockup generation
4. ✅ Check `failure_reasons` in response for debugging
5. ✅ Add comprehensive error logging

