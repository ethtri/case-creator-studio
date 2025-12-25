# Accounts Feature Plan (Lightweight)

This is a compact, security-first plan for account creation, saved designs, and order history.

## Goals
- Enable account creation/login (email/password + Google OAuth; Apple deferred).
- Let users save designs and view order history.
- Tie verified purchases to user accounts automatically.

## Security Requirements
- Require email verification before access to orders/designs.
- Enforce least-privilege RLS on all user data.
- Keep service-role keys server-only (edge functions).
- Prevent order/email enumeration with generic errors.
- Claim past orders only with verified email + ZIP (not email alone).

## Data Model (Supabase)
- `profiles`: `id` (uuid, pk, references auth.users), `email`, `full_name`, `created_at`, `updated_at`.
- `designs`: `id` (uuid), `user_id` (uuid, fk), `design_id` (text), `edm_template_id` (int), `variant_id` (text),
  `preview_url` (text), `preview_url_angled` (text, nullable), `source` (text: manual|purchase),
  `order_id` (uuid, nullable), `created_at`, `updated_at`.
- `orders`: add `user_id` (uuid, fk, nullable), index on `user_id`.

## RLS Policies (Least Privilege)
- `profiles`: user can `select/update` own row only.
- `designs`: user can `select/insert/update/delete` own rows only.
- `orders`: user can `select` own rows only; `update/insert` via service role only.

## Edge Functions (Updates)
- `create-checkout`: attach `user_id` from auth token when present.
- `my-orders`: return order summary for authenticated user only.
- `claim-orders`: verify email + ZIP, then set `user_id` if unclaimed.
- `stripe-webhook`: if `user_id` exists, auto-save purchase design in `designs`.
- Deprecate email-only order lookup or restrict to guest tracking flow.

## Frontend (UX)
- `/auth`: sign-in/up with email/password + OAuth buttons.
- Auth context + protected routes for `/orders` and `/designs`.
- Nav: account menu (sign in/out, profile).
- Save design button (requires login) + auto-save on purchase.
- `My Designs` and `My Orders` pages.

## Inputs Needed
- Google OAuth credentials + redirect URLs (prod + localhost).
- Final decision on guest tracking page (order # + email + ZIP).

## Verification
- `npm ci`
- `npm run build`
- `npm test --if-present`
- `npm run lint --if-present`
