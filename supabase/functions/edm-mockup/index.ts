import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ALLOWED_ORIGINS = [
  "https://snapcase.ai",
  "https://www.snapcase.ai",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isLocalhost = origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) || isLocalhost ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    templateId: z.number().int().positive(),
    variantId: z.number().int().positive(),
    productId: z.number().int().positive().optional(),
    mockupStyleIds: z.array(z.number().int().positive()).optional(),
  }),
  z.object({
    action: z.literal("status"),
    taskId: z.string().min(1).max(100),
  }),
]);

const PRINTFUL_STORE_ID = "17088301";
const PRINTFUL_API_BASE = "https://api.printful.com/v2";

function getPrintfulHeaders(apiKey: string): HeadersInit {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "X-PF-Store-ID": PRINTFUL_STORE_ID,
    "Content-Type": "application/json",
  };
}

function normalizeTaskPayload(payload: unknown): any {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const result = (data as any).result ?? (data as any).data ?? data;
  if (Array.isArray(result)) {
    return result[0];
  }
  if (Array.isArray(result?.data)) {
    return result.data[0];
  }
  return result;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const apiKey = Deno.env.get("PRINTFUL_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Printful integration error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (parsed.data.action === "create") {
      const { templateId, variantId, productId, mockupStyleIds } = parsed.data;
      let resolvedMockupStyles = mockupStyleIds;

      if ((!resolvedMockupStyles || resolvedMockupStyles.length === 0) && productId) {
        const stylesResponse = await fetch(`${PRINTFUL_API_BASE}/catalog-products/${productId}/mockup-styles`, {
          headers: getPrintfulHeaders(apiKey),
        });
        const stylesPayload = await stylesResponse.json();

        if (stylesResponse.ok) {
          const styles = stylesPayload?.result?.data ?? stylesPayload?.data ?? stylesPayload?.result ?? stylesPayload;
          const entries = Array.isArray(styles) ? styles : styles?.data ?? [];
          const flattened = Array.isArray(entries)
            ? entries.flatMap((entry: any) =>
                Array.isArray(entry?.mockup_styles)
                  ? entry.mockup_styles.map((style: any) => ({
                      placement: entry.placement,
                      viewName: entry.view_name,
                      id: style?.id,
                    }))
                  : []
              )
            : [];
          const frontStyle = flattened.find((entry: any) =>
            typeof entry?.viewName === "string" && entry.viewName.toLowerCase().includes("front")
          );
          const fallbackStyle = flattened[0];
          const styleId = frontStyle?.id ?? fallbackStyle?.id;
          resolvedMockupStyles = styleId ? [Number(styleId)] : undefined;
        } else {
          console.error("[EDM-MOCKUP] Failed to fetch mockup styles", stylesPayload);
        }
      }

      const response = await fetch(`${PRINTFUL_API_BASE}/mockup-tasks`, {
        method: "POST",
        headers: getPrintfulHeaders(apiKey),
        body: JSON.stringify({
          format: "jpg",
          mockup_width_px: 1000,
          products: [
            {
              source: "template",
              product_template_id: templateId,
              catalog_variant_ids: [variantId],
              ...(resolvedMockupStyles && resolvedMockupStyles.length > 0
                ? { mockup_style_ids: resolvedMockupStyles }
                : {}),
            },
          ],
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        console.error("[EDM-MOCKUP] Create task failed", payload);
        return new Response(JSON.stringify({ error: "Failed to create mockup task" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        });
      }

      const result = normalizeTaskPayload(payload);
      const taskId = result?.id ?? result?.task_id;

      if (!taskId) {
        return new Response(JSON.stringify({ error: "Mockup task id missing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        });
      }

      return new Response(JSON.stringify({ taskId: String(taskId) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const response = await fetch(`${PRINTFUL_API_BASE}/mockup-tasks?id=${parsed.data.taskId}`, {
      headers: getPrintfulHeaders(apiKey),
    });
    const payload = await response.json();

    if (!response.ok) {
      console.error("[EDM-MOCKUP] Status failed", payload);
      return new Response(JSON.stringify({ error: "Failed to fetch mockup status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 502,
      });
    }

    const result = normalizeTaskPayload(payload);
    const status = result?.status;
    const failureReasons = Array.isArray(result?.failure_reasons)
      ? result.failure_reasons
      : Array.isArray(result?.catalog_variant_mockups?.[0]?.failure_reasons)
      ? result.catalog_variant_mockups[0].failure_reasons
      : [];

    let mockupUrl: string | null = null;
    const variantMockups = Array.isArray(result?.catalog_variant_mockups)
      ? result.catalog_variant_mockups[0]
      : result?.catalog_variant_mockups;

    const mockupList = variantMockups?.mockups;

    if (Array.isArray(mockupList) && mockupList.length > 0) {
      mockupUrl = mockupList[0]?.mockup_url ?? mockupList[0]?.mockup_url_s;
    } else if (Array.isArray(result?.mockups) && result?.mockups.length > 0) {
      mockupUrl = result.mockups[0]?.mockup_url ?? result.mockups[0]?.mockup_url_s;
    }

    const failureMessages = Array.isArray(failureReasons)
      ? failureReasons
          .map((reason: any) => reason?.message ?? reason?.detail ?? reason?.title ?? String(reason))
          .filter(Boolean)
      : [];

    return new Response(JSON.stringify({ status, mockupUrl, failureReasons: failureMessages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[EDM-MOCKUP] Unexpected error", error);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
