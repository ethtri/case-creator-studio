import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

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
const STYLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STYLE_CACHE_EMPTY_TTL_MS = 30 * 60 * 1000;
const styleIdCache = new Map<string, { ids: number[]; expiresAt: number }>();

function getStyleCacheKey(productId: number, variantId: number): string {
  return `${productId}:${variantId}`;
}

function getCachedStyleIds(
  productId: number,
  variantId: number,
): number[] | null {
  const key = getStyleCacheKey(productId, variantId);
  const cached = styleIdCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    styleIdCache.delete(key);
    return null;
  }
  return cached.ids;
}

function setCachedStyleIds(
  productId: number,
  variantId: number,
  ids: number[],
): void {
  const ttl = ids.length > 0 ? STYLE_CACHE_TTL_MS : STYLE_CACHE_EMPTY_TTL_MS;
  styleIdCache.set(getStyleCacheKey(productId, variantId), {
    ids,
    expiresAt: Date.now() + ttl,
  });
}

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

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const directMessage = data.detail ??
    data.title ??
    data.message ??
    (data as any)?.error?.message ??
    data.error;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage.trim();
  }

  const errors = (data as any)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const firstError = errors[0];
    if (typeof firstError === "string") return firstError;
    const nestedMessage = firstError?.message ??
      firstError?.detail ??
      firstError?.title ??
      null;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  return null;
}

type MockupStyle = {
  id: number;
  placement?: string;
  viewName?: string;
  categoryName?: string;
  restrictedToVariants?: number[] | null;
};

function extractMockupStyles(payload: unknown): MockupStyle[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const raw = (data as any).result?.data ?? (data as any).data ??
    (data as any).result ?? data;
  const entries = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
  if (!Array.isArray(entries)) return [];

  const styles: MockupStyle[] = [];

  for (const entry of entries) {
    if (Array.isArray(entry?.mockup_styles)) {
      for (const style of entry.mockup_styles) {
        const idValue = style?.id ?? style?.style_id ?? entry?.style_id ??
          entry?.id;
        const id = Number(idValue);
        if (!Number.isFinite(id)) continue;
        styles.push({
          id,
          placement: typeof entry?.placement === "string"
            ? entry.placement
            : undefined,
          viewName: typeof style?.view_name === "string"
            ? style.view_name
            : typeof entry?.view_name === "string"
            ? entry.view_name
            : undefined,
          categoryName: typeof style?.category_name === "string"
            ? style.category_name
            : undefined,
          restrictedToVariants: Array.isArray(style?.restricted_to_variants)
            ? style.restricted_to_variants.map((value: unknown) =>
              Number(value)
            ).filter(Number.isFinite)
            : null,
        });
      }
      continue;
    }

    const idValue = entry?.id ?? entry?.style_id;
    const id = Number(idValue);
    if (!Number.isFinite(id)) continue;
    styles.push({
      id,
      placement: typeof entry?.placement === "string"
        ? entry.placement
        : undefined,
      viewName: typeof entry?.view_name === "string"
        ? entry.view_name
        : typeof entry?.display_name === "string"
        ? entry.display_name
        : undefined,
      categoryName: typeof entry?.category_name === "string"
        ? entry.category_name
        : undefined,
      restrictedToVariants: Array.isArray(entry?.restricted_to_variants)
        ? entry.restricted_to_variants.map((value: unknown) => Number(value))
          .filter(Number.isFinite)
        : null,
    });
  }

  return styles;
}

const FRONT_KEYWORDS = ["front", "outside"];
const ANGLED_KEYWORDS = [
  "3d",
  "angle",
  "angled",
  "lifestyle",
  "perspective",
  "scene",
  "hand",
  "desk",
  "side",
  "left",
  "right",
];

function normalizeStyleText(style: MockupStyle): string {
  return [
    style.placement,
    style.viewName,
    style.categoryName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function filterAllowedStyles(
  styles: MockupStyle[],
  variantId: number,
): MockupStyle[] {
  return styles.filter((style) => {
    if (
      !style.restrictedToVariants || style.restrictedToVariants.length === 0
    ) {
      return true;
    }
    return style.restrictedToVariants.includes(variantId);
  });
}

function pickPreferredStyleIds(
  styles: MockupStyle[],
  variantId: number,
): number[] {
  if (!styles.length) return [];
  const allowedStyles = filterAllowedStyles(styles, variantId);

  if (allowedStyles.length === 0) return [];

  const frontStyles = allowedStyles.filter((style) =>
    matchesAnyKeyword(normalizeStyleText(style), FRONT_KEYWORDS)
  );
  const angledStyles = allowedStyles.filter((style) =>
    matchesAnyKeyword(normalizeStyleText(style), ANGLED_KEYWORDS)
  );

  const frontId = frontStyles[0]?.id ?? allowedStyles[0]?.id ?? null;
  const angledId = angledStyles[0]?.id ?? null;

  const ids = [frontId, angledId].filter((value): value is number =>
    typeof value === "number"
  );
  return Array.from(new Set(ids));
}

function pickPreferredStyleId(
  styles: MockupStyle[],
  variantId: number,
): number | null {
  if (!styles.length) return null;
  const allowedStyles = filterAllowedStyles(styles, variantId);

  if (allowedStyles.length === 0) return null;

  const matchesFront = (style: MockupStyle) => {
    const combined = normalizeStyleText(style);
    return matchesAnyKeyword(combined, FRONT_KEYWORDS);
  };

  const preferred = allowedStyles.find(matchesFront);
  return preferred?.id ?? allowedStyles[0]?.id ?? null;
}

function classifyMockup(mockup: any): "front" | "angled" | null {
  const combined = [
    mockup?.placement,
    mockup?.display_name,
    mockup?.view_name,
    mockup?.style_name,
    mockup?.category_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (matchesAnyKeyword(combined, ANGLED_KEYWORDS)) {
    return "angled";
  }

  if (matchesAnyKeyword(combined, FRONT_KEYWORDS)) {
    return "front";
  }

  return null;
}

function extractMockupUrl(mockup: any): string | null {
  return mockup?.mockup_url ?? mockup?.mockup_url_s ?? null;
}

function pickMockupUrls(
  mockups: any[],
): { front: string | null; angled: string | null } {
  if (!Array.isArray(mockups) || mockups.length === 0) {
    return { front: null, angled: null };
  }

  let front: string | null = null;
  let angled: string | null = null;

  for (const mockup of mockups) {
    const url = extractMockupUrl(mockup);
    if (!url) continue;

    const classification = classifyMockup(mockup);
    if (classification === "front" && !front) {
      front = url;
    } else if (classification === "angled" && !angled) {
      angled = url;
    }
  }

  if (!front) {
    front = extractMockupUrl(mockups[0]);
  }

  if (!angled) {
    const fallback = mockups.find((mockup) =>
      extractMockupUrl(mockup) && extractMockupUrl(mockup) !== front
    );
    angled = fallback ? extractMockupUrl(fallback) : null;
  }

  return { front, angled };
}

function pickMockupUrl(mockups: any[]): string | null {
  if (!Array.isArray(mockups) || mockups.length === 0) return null;
  return pickMockupUrls(mockups).front;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rateLimitHeader = req.headers.get("x-ratelimit-remaining") ??
      req.headers.get("x-rate-limit-remaining") ??
      null;
    if (rateLimitHeader !== null) {
      const remaining = Number(rateLimitHeader);
      if (Number.isFinite(remaining) && remaining <= 0) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 429,
        });
      }
    }

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
      return new Response(
        JSON.stringify({ error: "Printful integration error" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (parsed.data.action === "create") {
      const { templateId, variantId, productId, mockupStyleIds } = parsed.data;
      let resolvedMockupStyles = mockupStyleIds;

      if (
        (!resolvedMockupStyles || resolvedMockupStyles.length === 0) &&
        productId
      ) {
        const cached = getCachedStyleIds(productId, variantId);
        if (cached) {
          resolvedMockupStyles = cached.length > 0 ? cached : undefined;
        } else {
          const stylesResponse = await fetch(
            `${PRINTFUL_API_BASE}/catalog-products/${productId}/mockup-styles`,
            {
              headers: getPrintfulHeaders(apiKey),
            },
          );
          const stylesPayload = await stylesResponse.json();

          if (stylesResponse.ok) {
            const styles = extractMockupStyles(stylesPayload);
            const styleIds = pickPreferredStyleIds(styles, variantId);
            setCachedStyleIds(productId, variantId, styleIds);
            resolvedMockupStyles = styleIds.length > 0 ? styleIds : undefined;
          } else {
            console.error(
              "[EDM-MOCKUP] Failed to fetch mockup styles",
              stylesPayload,
            );
          }
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
              source: "product_template",
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
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      const rateLimitReset = response.headers.get("x-ratelimit-reset");
      if (!response.ok) {
        console.error("[EDM-MOCKUP] Create task failed", payload);
        const detail = extractErrorMessage(payload);
        return new Response(
          JSON.stringify({
            error: "Failed to create mockup task",
            detail,
            rateLimitRemaining,
            rateLimitReset,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        );
      }

      const result = normalizeTaskPayload(payload);
      const taskId = result?.id ?? result?.task_id;

      if (!taskId) {
        return new Response(
          JSON.stringify({ error: "Mockup task id missing" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        );
      }

      return new Response(
        JSON.stringify({
          taskId: String(taskId),
          rateLimitRemaining,
          rateLimitReset,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const response = await fetch(
      `${PRINTFUL_API_BASE}/mockup-tasks?id=${parsed.data.taskId}`,
      {
        headers: getPrintfulHeaders(apiKey),
      },
    );
    const payload = await response.json();
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    const rateLimitReset = response.headers.get("x-ratelimit-reset");

    if (!response.ok) {
      console.error("[EDM-MOCKUP] Status failed", payload);
      const detail = extractErrorMessage(payload);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch mockup status",
          detail,
          rateLimitRemaining,
          rateLimitReset,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 502,
        },
      );
    }

    const result = normalizeTaskPayload(payload);
    const status = result?.status;
    const failureReasons = Array.isArray(result?.failure_reasons)
      ? result.failure_reasons
      : Array.isArray(result?.catalog_variant_mockups?.[0]?.failure_reasons)
      ? result.catalog_variant_mockups[0].failure_reasons
      : [];

    let mockupUrl: string | null = null;
    let mockupUrls: { front: string | null; angled: string | null } | null =
      null;
    const variantMockups = Array.isArray(result?.catalog_variant_mockups)
      ? result.catalog_variant_mockups[0]
      : result?.catalog_variant_mockups;

    const mockupList = variantMockups?.mockups;

    if (Array.isArray(mockupList) && mockupList.length > 0) {
      mockupUrls = pickMockupUrls(mockupList);
      mockupUrl = mockupUrls.front;
    } else if (Array.isArray(result?.mockups) && result?.mockups.length > 0) {
      mockupUrls = pickMockupUrls(result.mockups);
      mockupUrl = mockupUrls.front;
    }

    const failureMessages = Array.isArray(failureReasons)
      ? failureReasons
        .map((reason: any) =>
          reason?.message ?? reason?.detail ?? reason?.title ?? String(reason)
        )
        .filter(Boolean)
      : [];

    return new Response(
      JSON.stringify({
        status,
        mockupUrl,
        mockupUrls,
        failureReasons: failureMessages,
        rateLimitRemaining,
        rateLimitReset,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[EDM-MOCKUP] Unexpected error", error);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
