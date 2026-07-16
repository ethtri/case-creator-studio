# QA Smoke Test Checklist

Goal: validate the editor → preview → cart → checkout → order flow fast.

## Prerequisites
- Stripe test keys in `.env`
- Supabase reachable (functions deployed or local)
- Printful API key configured (for submission)

## Steps (10 minutes)
1. Open editor, create a simple design, continue to preview.
2. Verify preview renders and matches the selected variant.
3. Add to cart; confirm name + unit price + quantity changes.
4. Checkout with test shipping details.
5. In Stripe, verify line items + shipping + total.
6. Complete payment in test mode.
7. Confirm success page totals.
8. Verify Supabase order record totals.
9. (Optional) Submit to Printful; confirm status transitions.

## Expected
- Pricing consistent across cart, Stripe, and order records.
- No errors or regressions in editor → preview → checkout.

## Mobile editor regression
1. Open the editor in iPhone Safari or Android Chrome in portrait orientation.
2. Wait for the embedded designer to become interactive, then rotate to landscape and back to portrait.
3. Confirm the same design remains loaded, the editor does not show an error overlay, and the page does not reload.
4. Add an image or text after rotating and continue to preview.
5. Confirm the preview uses the selected phone model and the latest design.
