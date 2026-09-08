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
5. Click the Snapcase “Continue to Stripe” action once and verify the browser
   automatically navigates to the exact hosted Checkout Session URL returned by
   `create-checkout`; a successful API response or manually pasted URL is not a
   redirect canary.
6. In Stripe, verify line items + shipping + total.
7. Complete payment in test mode.
8. Confirm success page totals.
9. Verify Supabase order record totals.
10. (Optional) Submit to Printful; confirm status transitions.

For production checkout incident recovery, stop before payment and use one
synthetic email and one controlled item. Record the request result, automatic
Snapcase-to-Stripe navigation, Stripe product/email/subtotal/shipping/total,
exactly one pending order with the expected checkout columns, no queued recovery
email, no charge, and exclusion of the synthetic order from sales reporting.
Do not close the incident on backend-only, unit-test-only, or manually opened URL
evidence.

## Expected
- Pricing consistent across cart, Stripe, and order records.
- No errors or regressions in editor → preview → checkout.
- Hosted Stripe URLs using either current `/c/pay/` or observed `/f/pay/` paths
  redirect automatically without a `checkout_error` event.
