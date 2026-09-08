export type CheckoutClientObservation = {
  checkoutAttemptId: string;
  outcome: "redirect_accepted" | "client_rejected";
  errorCode?: "invalid_checkout_url";
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const reportCheckoutClientObservation = (
  observation: CheckoutClientObservation,
): void => {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;

  try {
    void fetch(`${SUPABASE_URL}/functions/v1/checkout-client-observation`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(observation),
    }).catch(() => {
      // Observability must never block or replace the Stripe redirect.
    });
  } catch {
    // Observability must never block or replace the Stripe redirect.
  }
};
