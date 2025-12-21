# Printful EDM Iframe Feasibility Assessment
**Date:** 2025-01-XX  
**Last Updated:** 2025-01-XX (Based on Printful API v2-beta documentation)  
**Purpose:** Technical assessment of Printful EDM iframe for design persistence and preview generation  
**Audience:** AI coding agents

## Recent Updates & Corrections

### API Response Schema Corrections:
- **Nonce Response:** `template_id` is at `result.template_id` (flat structure, not nested)
- **Nonce Value:** `result.nonce` is a string, not an object

### Save Method Corrections:
- **Valid:** `sendMessage({ event: 'saveDesign' })`
- **Invalid:** `sendMessage({ event: 'saveTemplate' })` - Not a recognized event

### Auto-Save Clarifications:
- EDM does NOT auto-save by default
- Must implement via `onDesignStatusUpdate` callback
- Recommended: Monitor `designChange` + `designValid` properties

## Executive Summary

**Design Persistence: FEASIBLE** - Can be implemented using `external_product_id` as persistent identifier. Current implementation needs modification to reuse IDs.

**Preview Generation: FEASIBLE** - Requires Mockup Generator API integration. Asynchronous process with 2-3 API calls per preview. No direct synchronous preview URL available.

## Design Persistence Analysis

### Current Implementation Issue

**File:** `src/pages/DesignEditorEDM.tsx:94`
```typescript
const externalProductId = `snapcase-${variantId}-${Date.now()}`;
```

**Problem:** Creates new `external_product_id` on every initialization, preventing design restoration.

### Solution: Persistent External Product ID

**Mechanism:**
1. Use stable `external_product_id` format: `snapcase-{variantId}-{userId}-{sessionId}` or `snapcase-{variantId}-{designId}`
2. Store mapping: `{variantId, userId, sessionId} -> external_product_id` in database or sessionStorage
3. When requesting nonce, Printful API returns existing `template_id` if `external_product_id` has saved template
4. Initialize EDM WITHOUT `initProduct` parameter to load existing template

### Implementation Pattern

**Step 1: Generate/Retrieve External Product ID**
```typescript
// On design start
const getOrCreateExternalProductId = (variantId: string, userId?: string) => {
  const key = `edm_external_id_${variantId}_${userId || 'guest'}`;
  let externalId = sessionStorage.getItem(key);
  if (!externalId) {
    externalId = `snapcase-${variantId}-${userId || 'guest'}-${Date.now()}`;
    sessionStorage.setItem(key, externalId);
  }
  return externalId;
};
```

**Step 2: Request Nonce (Returns Template ID if Exists)**
```typescript
// API: POST /embedded-designer/nonces
// Body: { external_product_id: "snapcase-iphone14-user123" }
// Response: { 
//   code: 200,
//   result: { 
//     nonce: "string",
//     template_id: 12345 | null,  // null if new design
//     expires_at: 1234567890
//   }
// }
// Note: template_id is at result.template_id (NOT nested under result.nonce)
```

**Step 3: Initialize EDM Conditionally**
```typescript
const config: PFDesignMakerConfig = {
  elemId: 'printful-designer',
  nonce: data.nonce,
  externalProductId: externalId,
  // Only include initProduct if template_id is null (new design)
  ...(data.templateId ? {} : {
    initProduct: {
      productId,
      variantIds: [variant.printfulVariantId],
    }
  }),
  onTemplateSaved: (id: number) => {
    // Store template_id for future reference
    sessionStorage.setItem(`edm_template_${externalId}`, id.toString());
  }
};
```

### Edge Cases

1. **User edits design, navigates away, returns**: Works if `external_product_id` is preserved
2. **User creates new design for same variant**: Need new `external_product_id` or duplicate template
3. **Multiple designs per variant**: Use unique `external_product_id` per design instance
4. **Guest users**: Use sessionStorage with session-based IDs (lost on browser clear)

### Database Schema Recommendation

```sql
-- Store EDM design mappings
CREATE TABLE edm_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  variant_id TEXT NOT NULL,
  external_product_id TEXT UNIQUE NOT NULL,
  template_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Preview Generation Analysis

### Current Implementation

**File:** `src/pages/Preview.tsx:47`
```typescript
const preview = sessionStorage.getItem("designPreview");
```

**Current Flow:** Uses base64 image from Fabric.js canvas export.

### EDM Preview Solution: Mockup Generator API

**API Endpoint:** `POST /v2/mockup-tasks`

**Request Pattern:**
```typescript
// 1. Create mockup task
const taskResponse = await fetch('https://api.printful.com/v2/mockup-tasks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'X-PF-Store-ID': storeId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    format: 'jpg',
    mockup_width_px: 1000,
    products: [{
      source: 'template',
      template_id: templateId, // From onTemplateSaved callback
      mockup_style_ids: [1115], // Front view style ID
      catalog_variant_ids: [variant.printfulVariantId]
    }]
  })
});

const { result: { task_id } } = await taskResponse.json();

// 2. Poll for completion
const pollMockupTask = async (taskId: string) => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://api.printful.com/v2/mockup-tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-PF-Store-ID': storeId
      }
    });
    const { result } = await response.json();
    if (result.status === 'completed') {
      return result.mockups[0].mockup_url; // Preview image URL
    }
    if (result.status === 'failed') {
      throw new Error('Mockup generation failed');
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
  }
  throw new Error('Mockup generation timeout');
};
```

### Implementation Flow

**On Design Save:**
1. User saves design → `onTemplateSaved(templateId)` callback fires
2. Immediately trigger mockup generation (async, don't block UI)
3. Store `templateId` in sessionStorage/database
4. Navigate to preview page

**On Preview Page Load:**
1. Check if preview URL already generated (store in sessionStorage/database)
2. If not, check if mockup task in progress
3. If no task, create new mockup task
4. Poll for completion (show loading state)
5. Display preview image when ready

**Caching Strategy:**
```typescript
// Cache preview URLs by template_id
const previewCacheKey = `edm_preview_${templateId}`;
const cachedPreview = sessionStorage.getItem(previewCacheKey);
if (cachedPreview) {
  setDesignPreview(cachedPreview);
} else {
  // Generate new preview
}
```

### Limitations

1. **Asynchronous**: Preview generation takes 5-30 seconds
2. **API Calls**: Requires 2-3 API calls per preview (create task, poll, retrieve)
3. **Rate Limits**: Printful may have rate limits on mockup generation
4. **Cost**: Mockup generation may have usage limits on free tier
5. **No Direct URL**: Cannot get preview URL directly from template (must generate)

### Alternative: Template Thumbnail

**Research Result:** Printful does NOT provide direct template thumbnail URLs via API.

**Available Methods:**
1. **Mockup Generator API** (recommended) - Generate preview images programmatically
2. **Printful Dashboard** - Download mockups manually (not suitable for programmatic access)
3. **Template Retrieval** - `GET /product-templates/{template_id}` or `GET /product-templates/@{external_product_id}` returns template metadata but NOT thumbnail URLs

**Conclusion:** Must use Mockup Generator API for programmatic preview generation. No direct thumbnail endpoint exists.

## Technical Implementation Requirements

### 1. Modify EDM Initialization

**File:** `src/pages/DesignEditorEDM.tsx`

**Changes:**
- Replace timestamp-based `external_product_id` with persistent ID
- Check for existing template_id in nonce response
- Conditionally include `initProduct` based on template existence
- Store `external_product_id` and `template_id` mapping

### 2. Add Preview Generation Service

**New File:** `src/services/printfulMockup.ts`

**Functions:**
- `generateMockupPreview(templateId: number, variantId: number): Promise<string>`
- `pollMockupTask(taskId: string): Promise<string>`
- `getCachedPreview(templateId: number): string | null`

### 3. Update Preview Page

**File:** `src/pages/Preview.tsx`

**Changes:**
- Check for EDM template_id instead of base64 preview
- Trigger mockup generation if needed
- Show loading state during generation
- Cache preview URLs

### 4. Database Schema (Optional but Recommended)

**Table:** `edm_designs`
- Store user designs with `external_product_id` and `template_id`
- Enable design restoration across sessions
- Support multiple designs per user/variant

## Save Design Methods

**Correct Programmatic Save:**
```typescript
designMaker.sendMessage({ event: 'saveDesign' });
```

**Save Confirmation:**
- `onTemplateSaved(templateId: number)` callback fires on successful save
- Works for both user-initiated and programmatic saves

**Invalid Methods (DO NOT USE):**
- `sendMessage({ event: 'saveTemplate' })` - Not a recognized event
- `sendMessage({ action: 'saveDesign' })` - Use 'event' not 'action'

**Auto-Save Pattern:**
- EDM does NOT auto-save by default
- Use `onDesignStatusUpdate` callback to detect changes
- Monitor `designChange` and `designValid` properties
- Trigger `saveDesign` when both are `true`

**References:**
- [Printful EDM Documentation](https://developers.printful.com/docs/edm/)

## Template Retrieval Methods

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

**References:**
- [Printful API Documentation - Product Templates](https://developers.printful.com/docs/v2-beta/#tag/Product-Templates)

## API Endpoints Reference

### Nonce Generation
```
POST https://api.printful.com/embedded-designer/nonces
Headers: Authorization: Bearer {token}
Body: { 
  external_product_id: string (required),
  external_customer_id?: string | null (optional),
  ip_address?: string | null (optional),
  user_agent?: string | null (optional)
}
Response: { 
  code: 200,
  result: { 
    nonce: string,
    template_id: number | null,  // null if new design
    expires_at: number  // UNIX timestamp
  }
}
```

**Important Notes:**
- `template_id` is at `result.template_id` (NOT nested under `result.nonce`)
- `nonce` is a string, not an object
- `template_id` is `null` when no template exists for the `external_product_id`
- Generating a new nonce for the same `external_product_id` invalidates previous nonces
- Saving a template also invalidates the nonce (new nonce required for further edits)

### Mockup Generation
```
POST https://api.printful.com/v2/mockup-tasks
Headers: Authorization: Bearer {token}, X-PF-Store-ID: {storeId}
Body: { format: string, mockup_width_px: number, products: [...] }
Response: { result: { task_id: string } }
```

### Mockup Task Status
```
GET https://api.printful.com/v2/mockup-tasks/{task_id}
Headers: Authorization: Bearer {token}, X-PF-Store-ID: {storeId}
Response: { result: { status: string, mockups: [{ mockup_url: string }] } }
```

## Risk Assessment

### Design Persistence Risks
- **LOW**: Implementation is straightforward, well-documented
- **MEDIUM**: Guest user persistence relies on sessionStorage (volatile)
- **LOW**: Database storage recommended for production

### Preview Generation Risks
- **MEDIUM**: Asynchronous nature requires UX considerations (loading states)
- **LOW**: API is stable and well-documented
- **MEDIUM**: Rate limits unknown, may need throttling
- **LOW**: Error handling required for failed generations

## Recommendations

1. **Implement persistent `external_product_id`** - Critical for design restoration
2. **Add database storage** - For production-grade persistence
3. **Implement mockup generation service** - Required for previews
4. **Add loading states** - Mockup generation is async
5. **Cache preview URLs** - Avoid regenerating same previews
6. **Handle errors gracefully** - Mockup generation can fail
7. **Consider fallback** - If mockup fails, show template thumbnail or placeholder
8. **Fix save methods** - Remove invalid `saveTemplate` event, use only `saveDesign`
9. **Improve auto-save** - Use `designChange` + `designValid` instead of `hasDesign` for better accuracy
10. **Document external_product_id rules** - Must be unique per design, stable for restoration

## Conclusion

Both features are **FEASIBLE** with Printful EDM iframe:
- Design persistence requires ID management changes (moderate effort)
- Preview generation requires Mockup Generator API integration (moderate effort)
- Both are well-supported by Printful API
- Implementation complexity: Medium
- Timeline impact: 2-3 days for both features

