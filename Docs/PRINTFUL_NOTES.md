# Printful Notes (MVP)

Short, high-signal references for the current Snapcase integration.

## Embedded Designer (EDM)
- Nonce response: `result.nonce` is a string, `result.template_id` is a number or null.
- Save programmatically with `sendMessage({ event: "saveDesign" })`. `saveTemplate` is not valid.
- EDM does not auto-save; use `onDesignStatusUpdate` and watch `designChange` + `designValid`.
- Use a stable `external_product_id` per design to restore; if `template_id` exists, omit `initProduct`.
- Saving a template invalidates the nonce; request a new nonce before further edits.
- There is no template thumbnail endpoint; use Mockup Generator for previews.

## Mockup Generator
- Use `source: "template"` and `product_template_id` (same ID returned by EDM `onTemplateSaved`).
- Snap cases often need `mockup_style_ids`; fetch via:
  - `GET /v2/catalog-products/{productId}/mockup-styles`
- Set `mockup_width_px` for consistent sizing.
- If using an account-level token, include `X-PF-Store-ID` header.
- Poll task status, surface `failure_reasons`, and handle rate limits gracefully.

## Order Submission
- Printful requires publicly accessible HTTP/HTTPS asset URLs (no base64 data URLs).
- Validate shipping address fields and ensure `state_code` is a 2-letter code for US.
