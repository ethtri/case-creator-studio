import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  buildRecoveryCartItems,
  LIFECYCLE_RECOVERY_CONTRACT_VERSION,
  recoveryAuthorizationNeedsUserVerification,
  SUPPORTED_RECOVERY_VARIANTS,
  validateRecoveryToken,
} from "../_shared/lifecycle-recovery.ts";
import { SNAPCASE_DEFAULT_PRODUCT_PRICE } from "../_shared/catalog-pricing.ts";

type RecoveryDatabaseState = Record<string, unknown> & {
  status?: unknown;
  ownerUserId?: unknown;
  flow?: unknown;
  variantId?: unknown;
  cartItems?: unknown;
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
});

const publicFailure = (
  status: string,
  corsHeaders: Record<string, string>,
  httpStatus = 200,
) => jsonResponse({ contractVersion: LIFECYCLE_RECOVERY_CONTRACT_VERSION, status }, httpStatus, corsHeaders);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return publicFailure("invalid", corsHeaders, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) return publicFailure("generic_failure", corsHeaders, 503);

  let input: Record<string, unknown>;
  try {
    input = await req.json() as Record<string, unknown>;
  } catch {
    return publicFailure("invalid", corsHeaders, 400);
  }
  const token = validateRecoveryToken(input.token);
  const action = input.action === "inspect" || input.action === "restore" ? input.action : null;
  if (!token || !action) return publicFailure("invalid", corsHeaders, 400);

  const authorization = req.headers.get("authorization") ?? "";
  let authenticatedUserId: string | null = null;
  if (recoveryAuthorizationNeedsUserVerification(
    authorization,
    req.headers.get("apikey"),
    anonKey,
  )) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await authClient.auth.getUser();
    if (error || !data.user) return publicFailure("invalid", corsHeaders, 401);
    authenticatedUserId = data.user.id;
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const readState = async (consume: boolean) => {
    const { data, error } = await admin.rpc("get_lifecycle_recovery_state", {
      p_token: token,
      p_consume: consume,
    });
    if (error || !data || typeof data !== "object") return null;
    return data as RecoveryDatabaseState;
  };

  const inspected = await readState(false);
  if (!inspected) return publicFailure("generic_failure", corsHeaders, 503);
  if (inspected.status !== "ready") {
    const status = typeof inspected.status === "string" ? inspected.status : "invalid";
    return publicFailure(status, corsHeaders);
  }
  if (
    authenticatedUserId && typeof inspected.ownerUserId === "string" &&
    inspected.ownerUserId !== authenticatedUserId
  ) return publicFailure("invalid", corsHeaders, 403);

  const variantId = typeof inspected.variantId === "string" ? inspected.variantId : "";
  if (!SUPPORTED_RECOVERY_VARIANTS.has(variantId)) return publicFailure("unavailable_model", corsHeaders);

  let cart: ReturnType<typeof buildRecoveryCartItems> = null;
  if (inspected.flow === "abandoned_cart") {
    cart = buildRecoveryCartItems(inspected.cartItems);
    if (!cart) return publicFailure("unavailable_model", corsHeaders);
  }

  const state = action === "restore" ? await readState(true) : inspected;
  if (!state || state.status !== "ready") {
    const status = typeof state?.status === "string" ? state.status : "generic_failure";
    return publicFailure(status, corsHeaders);
  }

  const response: Record<string, unknown> = {
    contractVersion: LIFECYCLE_RECOVERY_CONTRACT_VERSION,
    status: cart?.repriced ? "repriced" : "ready",
    flow: state.flow,
    variantId,
    currentUnitPrice: SNAPCASE_DEFAULT_PRODUCT_PRICE,
    repriced: cart?.repriced ?? false,
  };
  if (state.flow === "abandoned_design") {
    response.design = {
      designId: state.designId,
      designRevision: state.designRevision,
      edmTemplateId: state.edmTemplateId,
      externalProductId: state.externalProductId ?? null,
      previewUrl: state.previewUrl,
      previewUrlAngled: state.previewUrlAngled ?? null,
    };
  } else {
    response.items = cart?.items ?? [];
  }
  return jsonResponse(response, 200, corsHeaders);
});
