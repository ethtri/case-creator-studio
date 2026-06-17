import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildKexiaozhanCheckoutRedirectUrl } from "../_shared/kexiaozhan-checkout-redirect.ts";

const DEFAULT_BYPASS_COOKIE_MODE = "true";

function readTargetUrl(): string {
  return (
    Deno.env.get("KEXIAOZHAN_CHECKOUT_REDIRECT_TARGET_URL") ??
      Deno.env.get("KEXIAOZHAN_CHECKOUT_REDIRECT_TARGET") ??
      ""
  ).trim();
}

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const targetUrl = readTargetUrl();
  if (!targetUrl) {
    console.error(
      "[KEXIAOZHAN-CHECKOUT-REDIRECT] Missing target URL configuration",
    );
    return new Response("Redirect target is not configured", { status: 500 });
  }

  try {
    const redirectUrl = buildKexiaozhanCheckoutRedirectUrl(req.url, {
      targetUrl,
      vercelBypassSecret: Deno.env.get("KEXIAOZHAN_VERCEL_BYPASS_SECRET"),
      setBypassCookie: Deno.env.get("KEXIAOZHAN_VERCEL_SET_BYPASS_COOKIE") ??
        DEFAULT_BYPASS_COOKIE_MODE,
    });

    return new Response(null, {
      status: 307,
      headers: {
        Location: redirectUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[KEXIAOZHAN-CHECKOUT-REDIRECT] Redirect build failed:",
      error,
    );
    return new Response("Invalid redirect request", { status: 400 });
  }
});
