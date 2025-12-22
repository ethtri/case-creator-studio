# QA Smoke Test Checklist

Purpose: quick end-to-end validation of the editor → preview → cart → checkout → order flow.

## Prerequisites
- Valid Stripe test keys configured in `.env` for checkout.
- Supabase project accessible (functions deployed or local).
- Printful API key configured for order submission.

## Test Steps
1. Open the app and navigate to the editor.
2. Create a simple design and continue to preview.
3. Verify the preview renders and shows the selected device variant.
4. Add the item to cart from preview.
5. Open the cart and confirm:
   - Item name matches the selected variant.
   - Unit price shows `$29.99`.
   - Quantity controls update totals.
6. Proceed to checkout.
7. Fill contact + shipping details and submit checkout.
8. In Stripe Checkout, verify:
   - Line items show $29.99 per case.
   - Shipping line item shows $4.99.
   - Total matches subtotal + shipping.
9. Complete payment (test mode).
10. Confirm order success page shows the correct total.
11. Verify order record in Supabase:
    - `subtotal` is `29.99 * quantity`.
    - `shipping_cost` is `4.99`.
    - `total` matches subtotal + shipping.
12. (Optional) Submit order to Printful and confirm status transitions.

## Expected Results
- Pricing is consistent across catalog, cart, checkout, Stripe, and order records.
- No errors or regressions in the editor → preview → checkout flow.
