# Bounded-offer deployment compatibility

The bounded offer release uses the explicit
`supabase/functions/stripe-webhook/production-offer.ts` entrypoint for the
`stripe-webhook` function. Do not substitute `index.ts`: that source includes a
broader feature set outside this offer's release contract.

## Isolated changes

The compatibility entrypoint preserves the reference non-offer order/Printful
path, with these declared changes:

1. Await Stripe's asynchronous signature-verification API with its explicit
   Web Crypto provider for the Deno runtime;
   signature failure precedes all database and fulfillment actions.
2. Route the four checkout lifecycle events through offer reconciliation only
   when the signed Session bears this campaign's metadata.
3. Use current provider state for offered Sessions: retain processing/unknown
   reservations, return after confirmed expiry, and require complete/paid before
   entering the existing order/Printful path.

Refund events retain the reference ignored behavior; paid offer slots remain
terminal. This entrypoint does not introduce GA4, additional customer emails,
onshore routing, credentials or unrelated schema dependencies. The broader
`index.ts` is retained for its existing owner and is not the release entrypoint.

Reference source is the existing [public webhook](https://github.com/ethtri/case-creator-studio/blob/a28ee9b5cdc78ab2d71003032478295c4fd14041/supabase/functions/stripe-webhook/index.ts).
The preservation test removes only the declared compatibility edits and compares
the normalized reference hash. Runtime fixtures exercise signature rejection,
ordinary behavior and offered pending/expired/failed/paid paths without provider
requests or charges. Provider-side configuration is separate from these fixtures.

## Release order and gates

After review/CI and release authorization, apply only the capped-offer migration;
verify disabled/empty configuration and private grants; deploy the compatibility
webhook before checkout; then release the frontend. Preserve the existing custom
signature/origin authentication configuration. Do not activate issuance or change
Stripe endpoint state/subscriptions merely to test a code deployment.

Activation requires verified provider configuration, an exact launch window and
the bounded offer authorization. Preserve ledger rows on rollback and retain
reconciliation for any issued Sessions. Keep account-specific costs and private
operational receipts outside public repository documentation.
