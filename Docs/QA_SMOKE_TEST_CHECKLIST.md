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
