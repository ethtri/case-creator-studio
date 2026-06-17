export type StripeMode = "test" | "live";

export function getStripeMode(): StripeMode {
  const rawMode = (Deno.env.get("STRIPE_MODE") ?? "live").trim().toLowerCase();
  if (!rawMode || rawMode === "live" || rawMode === "production") {
    return "live";
  }
  if (rawMode === "test") {
    return "test";
  }
  throw new Error(`[STRIPE] Unsupported STRIPE_MODE: ${rawMode}`);
}

function requireEnv(name: string, context: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`[${context}] Missing required ${name}`);
  }
  return value;
}

export function getStripeSecretKey(context = "STRIPE"): string {
  const mode = getStripeMode();
  const key = mode === "test"
    ? requireEnv("STRIPE_SECRET_KEY_TEST", context)
    : requireEnv("STRIPE_SECRET_KEY", context);
  const validPrefix = mode === "test"
    ? (key.startsWith("sk_test_") || key.startsWith("rk_test_"))
    : (key.startsWith("sk_live_") || key.startsWith("rk_live_"));

  if (!validPrefix) {
    throw new Error(
      `[${context}] Stripe secret key does not match ${mode} mode`,
    );
  }

  return key;
}

export function getStripeWebhookSecret(context = "STRIPE"): string {
  return getStripeMode() === "test"
    ? requireEnv("STRIPE_WEBHOOK_SECRET_TEST", context)
    : requireEnv("STRIPE_WEBHOOK_SECRET", context);
}
