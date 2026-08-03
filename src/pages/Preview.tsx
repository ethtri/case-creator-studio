import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ChevronLeft, ShoppingCart, CreditCard, Check, Smartphone, Eye, Bookmark } from "lucide-react";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isPreviewUrl } from "@/utils/preview";
import { trackMarketingEvent } from "@/lib/marketing";
import { asMarketingItems, buildAnalyticsItem } from "@/lib/analytics-commerce";

// Import mockup images
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";

type MockupView = "front" | "angled";

const getMockupImage = (brand: string): string => {
  const isApple = brand.toLowerCase() === "apple";
  return isApple ? iphoneCaseFront : samsungCaseFront;
};

const extractFunctionErrorMessage = async (
  error: unknown,
  response?: Response
): Promise<string | null> => {
  if (response) {
    const contentType = response.headers.get("Content-Type") ?? "";
    const isJson = contentType.includes("application/json") || contentType.includes("application/problem+json");
    try {
      if (isJson) {
        const payload = await response.clone().json();
        const failureReasons = Array.isArray(payload?.failureReasons) ? payload.failureReasons : [];
        const failureReason = failureReasons.find((reason) => typeof reason === "string");
        const detail =
          failureReason ??
          payload?.detail ??
          payload?.error ??
          payload?.message ??
          payload?.title ??
          payload?.error?.message ??
          null;
        if (typeof detail === "string" && detail.trim()) {
          return detail.trim();
        }
      } else {
        const text = await response.clone().text();
        if (text) return text;
      }
    } catch {
      // ignore parse failures and fall back to generic error handling
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return null;
};

const formatEdmPreviewError = (
  detail: string | null,
  rateLimitReset?: string | null
): string => {
  if (!detail) {
    return "Please try again.";
  }

  const normalized = detail.toLowerCase();
  if (normalized.includes("printful integration error") || normalized.includes("api key")) {
    return "Preview service isn't configured yet.";
  }
  if (normalized.includes("variant not found")) {
    return "Preview unavailable for this phone model yet.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    if (rateLimitReset) {
      const resetSeconds = Number(rateLimitReset);
      if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
        return `Preview service is busy. Try again in ~${Math.ceil(resetSeconds)}s.`;
      }
    }
    return "Preview service is busy. Please try again in a moment.";
  }

  return detail;
};

const Preview = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasLoggedMissingTemplateRef = useRef(false);
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [designPreviewAngled, setDesignPreviewAngled] = useState<string | null>(null);
  const [edmTemplateId, setEdmTemplateId] = useState<number | null>(null);
  const [edmPreviewLoading, setEdmPreviewLoading] = useState(false);
  const [edmPreviewError, setEdmPreviewError] = useState<string | null>(null);
  const [showPreviewError, setShowPreviewError] = useState(false);
  const [previewKind, setPreviewKind] = useState<"design" | "mockup">("design");
  const [activeView, setActiveView] = useState<MockupView>("front");
  const [designId, setDesignId] = useState<string | null>(null);
  const [previewRetryNonce, setPreviewRetryNonce] = useState(0);
  const autoRetryRef = useRef<{ timer: number | null; count: number }>({ timer: null, count: 0 });
  const autoRetryInFlightRef = useRef(false);
  const previewErrorTimerRef = useRef<number | null>(null);
  const addInFlightRef = useRef(false);
  const { addToCart, items } = useCart();
  const { user, isEmailVerified } = useAuth();
  const EDM_PREVIEW_CACHE_VERSION = "v4";
  const isDev = import.meta.env.DEV;
  const [externalProductId, setExternalProductId] = useState<string | null>(null);
  const [isSavingDesign, setIsSavingDesign] = useState(false);
  const currentDesignReady = Boolean(
    variant && isPreviewUrl(designPreview) && typeof edmTemplateId === "number"
  );
  const currentDesignInCart = Boolean(
    variant &&
      typeof edmTemplateId === "number" &&
      items.some(
        (item) =>
          item.variant.id === variant.id &&
          item.edmTemplateId === edmTemplateId &&
          (item.designId ?? null) === (designId ?? null),
      )
  );
  const hasInvalidCartItems = items.some(
    (item) =>
      typeof item.edmTemplateId !== "number" || !isPreviewUrl(item.designPreview)
  );
  const canProceedToCheckout = items.length > 0 && !hasInvalidCartItems;
  const purchaseState = currentDesignInCart
    ? "in-cart"
    : currentDesignReady
      ? "ready"
      : "preparing";
  const purchaseStatus = currentDesignInCart
    ? canProceedToCheckout
      ? "Added to cart. Continue to checkout when you are ready."
      : "This design is in your cart. Checkout becomes available after every design preview finishes saving."
    : currentDesignReady
      ? "Your production preview is ready to add to the cart."
      : "Preparing your production preview. Add to Cart becomes available after it finishes and is saved to this phone model.";

  const buildDesignKey = (id: string, suffix: string) => `edmDesign:${id}:${suffix}`;
  const editorPath = variantId
    ? designId
      ? `/design/${variantId}?designId=${designId}`
      : `/design/${variantId}`
    : "/catalog";

  useEffect(() => {
    if (currentDesignInCart) {
      addInFlightRef.current = false;
    }
  }, [currentDesignInCart]);

  useEffect(() => {
    const paramDesignId = searchParams.get("designId");
    const fallbackDesignId = sessionStorage.getItem("edmDesign:last");
    const resolvedDesignId = paramDesignId || fallbackDesignId;
    if (resolvedDesignId) {
      setDesignId(resolvedDesignId);
      sessionStorage.setItem("edmDesign:last", resolvedDesignId);
    }
    const storedExternalProductId = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "externalProductId"))
      : null;
    setExternalProductId(storedExternalProductId);

    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      // If no variant found, redirect to catalog
      navigate("/catalog");
      return;
    }

    // Get preview from session storage
    const previewVersion = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "previewVersion"))
      : sessionStorage.getItem("designPreviewVersion");
    const previewDirtyAtRaw = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "previewDirtyAt"))
      : null;
    const previewGeneratedAtRaw = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "previewGeneratedAt"))
      : sessionStorage.getItem("designPreviewGeneratedAt");
    const previewDirtyAt = previewDirtyAtRaw ? Number(previewDirtyAtRaw) : null;
    const previewGeneratedAt = previewGeneratedAtRaw ? Number(previewGeneratedAtRaw) : null;
    const previewIsFresh = previewVersion === EDM_PREVIEW_CACHE_VERSION;
    const previewIsCurrent =
      previewIsFresh &&
      previewRetryNonce === 0 &&
      (!previewDirtyAt || (previewGeneratedAt !== null && previewGeneratedAt >= previewDirtyAt));
    const preview = previewIsCurrent
      ? resolvedDesignId
        ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "preview"))
        : sessionStorage.getItem("designPreview")
      : null;
    const previewAngled = previewIsCurrent
      ? resolvedDesignId
        ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "previewAngled"))
        : sessionStorage.getItem("designPreviewAngled")
      : null;
    const storedVariant = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "variantId"))
      : sessionStorage.getItem("designVariant");
    const storedTemplateId = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "templateId"))
      : sessionStorage.getItem("edmTemplateId");
    const storedPreviewKind = resolvedDesignId
      ? sessionStorage.getItem(buildDesignKey(resolvedDesignId, "previewKind"))
      : sessionStorage.getItem("designPreviewKind");
    
    const parsedTemplateId = storedTemplateId ? Number(storedTemplateId) : null;
    const resolvedTemplateId = Number.isNaN(parsedTemplateId) ? null : parsedTemplateId;

    if (!previewIsCurrent) {
      const designPreviewKey = resolvedDesignId ? buildDesignKey(resolvedDesignId, "preview") : null;
      const designPreviewAngledKey = resolvedDesignId ? buildDesignKey(resolvedDesignId, "previewAngled") : null;
      if (designPreviewKey) {
        sessionStorage.removeItem(designPreviewKey);
      }
      if (designPreviewAngledKey) {
        sessionStorage.removeItem(designPreviewAngledKey);
      }
      sessionStorage.removeItem("designPreview");
      sessionStorage.removeItem("designPreviewAngled");
    }

    if (preview && storedVariant === variantId) {
      setDesignPreview(preview);
      if (previewAngled) {
        setDesignPreviewAngled(previewAngled);
      }
      if (resolvedTemplateId) {
        setEdmTemplateId(resolvedTemplateId);
      }
      if (storedPreviewKind === "mockup") {
        setPreviewKind("mockup");
      }
    } else if (!preview && resolvedTemplateId && storedVariant === variantId) {
      setEdmTemplateId(resolvedTemplateId);
    } else if (!preview && !resolvedDesignId) {
      // No design, redirect back to editor
      navigate(editorPath);
    }
  }, [variantId, navigate, searchParams, editorPath, previewRetryNonce]);

  useEffect(() => {
    if (!designId || edmTemplateId || hasLoggedMissingTemplateRef.current) return;
    hasLoggedMissingTemplateRef.current = true;
    if (isDev) {
      console.warn("[Preview] EDM templateId missing for design", designId);
    }
  }, [designId, edmTemplateId, isDev]);

  useEffect(() => {
    if (!variant || !edmTemplateId) return;

    const cacheKey = `edmPreview_${EDM_PREVIEW_CACHE_VERSION}_${edmTemplateId}_${variant.printfulVariantId}`;
    const cacheKeyAngled = `${cacheKey}_angled`;
    const designPreviewKey = designId ? buildDesignKey(designId, "preview") : null;
    const designPreviewAngledKey = designId ? buildDesignKey(designId, "previewAngled") : null;
    const previewVersion = designId
      ? sessionStorage.getItem(buildDesignKey(designId, "previewVersion"))
      : sessionStorage.getItem("designPreviewVersion");
    const previewDirtyAtRaw = designId
      ? sessionStorage.getItem(buildDesignKey(designId, "previewDirtyAt"))
      : null;
    const previewGeneratedAtRaw = designId
      ? sessionStorage.getItem(buildDesignKey(designId, "previewGeneratedAt"))
      : sessionStorage.getItem("designPreviewGeneratedAt");
    const previewDirtyAt = previewDirtyAtRaw ? Number(previewDirtyAtRaw) : null;
    const previewGeneratedAt = previewGeneratedAtRaw ? Number(previewGeneratedAtRaw) : null;
    const previewIsFresh =
      previewVersion === EDM_PREVIEW_CACHE_VERSION &&
      previewRetryNonce === 0 &&
      (!previewDirtyAt || (previewGeneratedAt !== null && previewGeneratedAt >= previewDirtyAt));
    const cachedPreview = previewIsFresh
      ? designPreviewKey
        ? sessionStorage.getItem(designPreviewKey)
        : sessionStorage.getItem(cacheKey)
      : null;
    const cachedPreviewAngled = previewIsFresh
      ? designPreviewAngledKey
        ? sessionStorage.getItem(designPreviewAngledKey)
        : sessionStorage.getItem(cacheKeyAngled)
      : null;
    if (cachedPreview) {
      setDesignPreview(cachedPreview);
      if (cachedPreviewAngled) {
        setDesignPreviewAngled(cachedPreviewAngled);
      }
      return;
    }

    let cancelled = false;
    const fetchPreview = async () => {
      setEdmPreviewLoading(true);
      setEdmPreviewError(null);
      setShowPreviewError(false);
      autoRetryInFlightRef.current = false;
      if (previewErrorTimerRef.current) {
        window.clearTimeout(previewErrorTimerRef.current);
        previewErrorTimerRef.current = null;
      }

      try {
        const productId = variant.brand.toLowerCase() === "apple" ? 683 : 684;
        const taskKey = `edmMockupTask_${EDM_PREVIEW_CACHE_VERSION}_${edmTemplateId}_${variant.printfulVariantId}`;
        let taskId = sessionStorage.getItem(taskKey);

        if (!taskId) {
          const { data, error, response } = await supabase.functions.invoke("edm-mockup", {
            body: {
              action: "create",
              templateId: edmTemplateId,
              variantId: variant.printfulVariantId,
              productId,
            },
          });

          if (error) {
            const detail = await extractFunctionErrorMessage(error, response);
            const resetHeader = response?.headers?.get("x-ratelimit-reset") ?? data?.rateLimitReset ?? null;
            const resetSeconds = resetHeader ? Number(resetHeader) : null;
            const err = new Error(formatEdmPreviewError(detail, resetHeader) || "Mockup request failed");
            if (detail?.toLowerCase().includes("rate limit") || detail?.toLowerCase().includes("too many requests")) {
              (err as { rateLimitResetSeconds?: number | null }).rateLimitResetSeconds = Number.isFinite(resetSeconds)
                ? resetSeconds
                : null;
            }
            throw err;
          }

          taskId = data?.taskId;
          if (!taskId) {
            throw new Error("Mockup task id missing");
          }

          sessionStorage.setItem(taskKey, taskId);
        }

        const maxAttempts = 15;
        const baseDelayMs = 550;
        const maxDelayMs = 1800;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (cancelled) return;
          const { data, error, response } = await supabase.functions.invoke("edm-mockup", {
            body: {
              action: "status",
              taskId,
            },
          });

          if (error) {
            const detail = await extractFunctionErrorMessage(error, response);
            const resetHeader = response?.headers?.get("x-ratelimit-reset") ?? data?.rateLimitReset ?? null;
            const resetSeconds = resetHeader ? Number(resetHeader) : null;
            const err = new Error(formatEdmPreviewError(detail, resetHeader) || "Mockup request failed");
            if (detail?.toLowerCase().includes("rate limit") || detail?.toLowerCase().includes("too many requests")) {
              (err as { rateLimitResetSeconds?: number | null }).rateLimitResetSeconds = Number.isFinite(resetSeconds)
                ? resetSeconds
                : null;
            }
            throw err;
          }

          const status = data?.status;
          const mockupUrl = data?.mockupUrl;
          const mockupUrls = data?.mockupUrls;
          const mockupUrlAngled = typeof mockupUrls?.angled === "string" ? mockupUrls.angled : null;
          const failureReasons = Array.isArray(data?.failureReasons) ? data.failureReasons : [];

          if (status === "completed" && mockupUrl) {
            sessionStorage.setItem(cacheKey, mockupUrl);
            sessionStorage.setItem("designPreview", mockupUrl);
            if (mockupUrlAngled && mockupUrlAngled !== mockupUrl) {
              sessionStorage.setItem(cacheKeyAngled, mockupUrlAngled);
              sessionStorage.setItem("designPreviewAngled", mockupUrlAngled);
            }
            if (designPreviewKey) {
              sessionStorage.setItem(designPreviewKey, mockupUrl);
              sessionStorage.setItem(buildDesignKey(designId, "previewKind"), "mockup");
              sessionStorage.setItem(buildDesignKey(designId, "previewVersion"), EDM_PREVIEW_CACHE_VERSION);
              sessionStorage.setItem(buildDesignKey(designId, "previewGeneratedAt"), Date.now().toString());
              sessionStorage.removeItem(buildDesignKey(designId, "previewDirtyAt"));
              if (designPreviewAngledKey && mockupUrlAngled && mockupUrlAngled !== mockupUrl) {
                sessionStorage.setItem(designPreviewAngledKey, mockupUrlAngled);
              }
            }
            sessionStorage.setItem("designPreviewKind", "mockup");
            sessionStorage.setItem("designPreviewVersion", EDM_PREVIEW_CACHE_VERSION);
            sessionStorage.setItem("designPreviewGeneratedAt", Date.now().toString());
            setDesignPreview(mockupUrl);
            if (mockupUrlAngled && mockupUrlAngled !== mockupUrl) {
              setDesignPreviewAngled(mockupUrlAngled);
            }
            setPreviewKind("mockup");
            trackMarketingEvent("preview_success", {
              variant_id: variant.id,
              brand: variant.brand,
              model: variant.model,
              has_angled_view: Boolean(mockupUrlAngled && mockupUrlAngled !== mockupUrl),
            });
            autoRetryRef.current.count = 0;
            autoRetryInFlightRef.current = false;
            setEdmPreviewLoading(false);
            return;
          }

          if (status === "failed") {
            sessionStorage.removeItem(taskKey);
            const failureMessage = failureReasons[0];
            if (failureMessage && failureMessage.toLowerCase().includes("rate limit")) {
              const err = new Error("Preview service is busy. Please try again in a moment.");
              (err as { rateLimitResetSeconds?: number | null }).rateLimitResetSeconds = 2;
              throw err;
            }
            throw new Error(failureMessage || "Mockup generation failed");
          }

          if (status === "completed" && !mockupUrl) {
            sessionStorage.removeItem(taskKey);
            const failureMessage = failureReasons[0];
            if (failureMessage && failureMessage.toLowerCase().includes("rate limit")) {
              const err = new Error("Preview service is busy. Please try again in a moment.");
              (err as { rateLimitResetSeconds?: number | null }).rateLimitResetSeconds = 2;
              throw err;
            }
            throw new Error(failureMessage || "Mockup completed without an image");
          }

          const delayMs = Math.min(maxDelayMs, baseDelayMs + attempt * 200);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        sessionStorage.removeItem(taskKey);
        throw new Error("Preview is taking longer than expected. Please try again.");
      } catch (err) {
        if (cancelled) return;
        const rawMessage = err instanceof Error ? err.message : "";
        const message = rawMessage ? rawMessage : "Failed to generate preview";
        const rateLimitResetSeconds = (err as { rateLimitResetSeconds?: number | null }).rateLimitResetSeconds ?? null;
        const isRateLimit =
          Boolean(rateLimitResetSeconds) ||
          message.toLowerCase().includes("preview service is busy") ||
          message.toLowerCase().includes("rate limit");
        if (isRateLimit && autoRetryRef.current.count < 3) {
          autoRetryRef.current.count += 1;
          autoRetryInFlightRef.current = true;
          const delayMs = Math.min(8000, Math.max(1500, (rateLimitResetSeconds ?? 2) * 1000));
          setEdmPreviewError(`Preview service is busy. Retrying in ~${Math.ceil(delayMs / 1000)}s.`);
          if (autoRetryRef.current.timer) {
            window.clearTimeout(autoRetryRef.current.timer);
          }
          autoRetryRef.current.timer = window.setTimeout(() => {
            setPreviewRetryNonce((value) => value + 1);
          }, delayMs);
          return;
        }
        autoRetryRef.current.count = 0;
        autoRetryInFlightRef.current = false;
        trackMarketingEvent("preview_failure", {
          variant_id: variant.id,
          brand: variant.brand,
          model: variant.model,
          error_code: isRateLimit ? "preview_rate_limited" : "preview_generation_failed",
        });
        setEdmPreviewError(message);
        previewErrorTimerRef.current = window.setTimeout(() => {
          setShowPreviewError(true);
        }, 30000);
      } finally {
        if (!cancelled && !autoRetryInFlightRef.current) {
          setEdmPreviewLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
      if (previewErrorTimerRef.current) {
        window.clearTimeout(previewErrorTimerRef.current);
        previewErrorTimerRef.current = null;
      }
      if (autoRetryRef.current.timer) {
        window.clearTimeout(autoRetryRef.current.timer);
        autoRetryRef.current.timer = null;
      }
    };
  }, [variant, edmTemplateId, designId, previewRetryNonce]);

  useEffect(() => {
    if (!designId || edmTemplateId) return;
    let cancelled = false;
    const interval = window.setInterval(() => {
      if (cancelled) return;
      const storedTemplateId = sessionStorage.getItem(buildDesignKey(designId, "templateId"));
      if (!storedTemplateId) return;
      const parsed = Number(storedTemplateId);
      if (Number.isNaN(parsed)) return;
      setEdmTemplateId(parsed);
      window.clearInterval(interval);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [designId, edmTemplateId]);

  const handlePrimaryPurchaseAction = () => {
    if (currentDesignInCart) {
      if (!canProceedToCheckout) {
        toast.error("Finish saving every design preview before checking out.");
        return;
      }
      navigate(`/checkout/${variantId}`);
      return;
    }

    if (addInFlightRef.current) return;
    if (!variant || !designPreview) return;
    if (typeof edmTemplateId !== "number") {
      toast.error("Finish saving your design before adding it to the cart.");
      return;
    }
    if (!isPreviewUrl(designPreview)) {
      toast.error("Wait for the preview to finish before adding it to the cart.");
      return;
    }
    addInFlightRef.current = true;
    addToCart(variant, designPreview, edmTemplateId, designId, externalProductId);
    trackMarketingEvent("add_to_cart", {
      value: variant.price,
      currency: variant.currency,
      items: asMarketingItems(
        [buildAnalyticsItem({ variant, quantity: 1 })].filter(Boolean),
      ),
    });
    toast.success("Added to cart!");
  };

  const handleSaveDesign = async () => {
    if (!user) {
      const redirectTarget = encodeURIComponent(`/preview/${variantId}${designId ? `?designId=${designId}` : ""}`);
      navigate(`/auth?redirect=${redirectTarget}`);
      return;
    }
    if (!isEmailVerified) {
      toast.info("Please verify your email to save designs.");
      return;
    }
    if (!variant || !designPreview || !designId) {
      toast.error("Design isn't ready to save yet.");
      return;
    }
    if (!edmTemplateId) {
      toast.error("Finish saving your design before saving it to your account.");
      return;
    }

    setIsSavingDesign(true);
    const { error } = await supabase.functions.invoke("save-design", {
      body: {
        designId,
        variantId: variant.id,
        edmTemplateId,
        externalProductId,
        previewUrl: designPreview,
        previewUrlAngled: designPreviewAngled,
      },
    });

    if (error) {
      toast.error("Unable to save design. Please try again.");
    } else {
      trackMarketingEvent("design_save", {
        variant_id: variant.id,
        brand: variant.brand,
        model: variant.model,
      });
      toast.success("Design saved to your account.");
    }
    setIsSavingDesign(false);
  };

  const handleRetryPreview = () => {
    if (!variant || !edmTemplateId) return;
    const cacheKey = `edmPreview_${EDM_PREVIEW_CACHE_VERSION}_${edmTemplateId}_${variant.printfulVariantId}`;
    const cacheKeyAngled = `${cacheKey}_angled`;
    const taskKey = `edmMockupTask_${EDM_PREVIEW_CACHE_VERSION}_${edmTemplateId}_${variant.printfulVariantId}`;
    const designPreviewKey = designId ? buildDesignKey(designId, "preview") : null;
    const designPreviewAngledKey = designId ? buildDesignKey(designId, "previewAngled") : null;
    const designPreviewDirtyKey = designId ? buildDesignKey(designId, "previewDirtyAt") : null;
    const designPreviewGeneratedKey = designId ? buildDesignKey(designId, "previewGeneratedAt") : null;

    sessionStorage.removeItem(cacheKey);
    sessionStorage.removeItem(cacheKeyAngled);
    sessionStorage.removeItem(taskKey);
    sessionStorage.removeItem("designPreview");
    sessionStorage.removeItem("designPreviewAngled");
    sessionStorage.removeItem("designPreviewGeneratedAt");
    if (designPreviewKey) {
      sessionStorage.removeItem(designPreviewKey);
    }
    if (designPreviewAngledKey) {
      sessionStorage.removeItem(designPreviewAngledKey);
    }
    if (designPreviewDirtyKey) {
      sessionStorage.removeItem(designPreviewDirtyKey);
    }
    if (designPreviewGeneratedKey) {
      sessionStorage.removeItem(designPreviewGeneratedKey);
    }

    setEdmPreviewError(null);
    setPreviewKind("design");
    autoRetryRef.current.count = 0;
    if (autoRetryRef.current.timer) {
      window.clearTimeout(autoRetryRef.current.timer);
      autoRetryRef.current.timer = null;
    }
    setPreviewRetryNonce((value) => value + 1);
  };

  const angledAvailable =
    previewKind === "mockup" &&
    !!designPreviewAngled &&
    designPreviewAngled !== designPreview;
  const mockupViews: { name: string; view: MockupView; icon: typeof Eye }[] = [
    { name: "Front", view: "front", icon: Smartphone },
    ...(angledAvailable
      ? [{ name: "3D View", view: "angled" as const, icon: Eye }]
      : []),
  ];
  const showPreviewLoader = edmPreviewLoading;
  const showViewControls =
    !showPreviewLoader &&
    (!edmPreviewError || Boolean(designPreview)) &&
    mockupViews.length > 1;
  const showMissingTemplateBadge = !!designId && !edmTemplateId;

  useEffect(() => {
    if (activeView === "angled" && !angledAvailable) {
      setActiveView("front");
    }
  }, [activeView, angledAvailable]);

  if (!variant) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center" role="status" aria-live="polite">
          <div className="animate-spin w-8 h-8 border-2 border-cta border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </main>
    );
  }

  const isApple = variant.brand.toLowerCase() === "apple";
  const useMockupPreview = previewKind === "mockup" && !!designPreview;
  const resolvedActiveView = activeView === "angled" && !angledAvailable ? "front" : activeView;
  const mockupPreviewSrc = resolvedActiveView === "angled"
    ? designPreviewAngled ?? designPreview
    : designPreview;
  const baseImageSrc = useMockupPreview
    ? mockupPreviewSrc!
    : getMockupImage(variant.brand);

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu showBrowse={false} />
            <Button
              variant="outline"
              className="min-w-11 px-3 sm:px-4"
              onClick={() => navigate(editorPath)}
              disabled={!variantId}
              aria-label="Back to editor"
            >
              <ChevronLeft className="w-4 h-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">Back to Editor</span>
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-10 lg:py-12">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Mockup Preview */}
          <div className="lg:sticky lg:top-6">
            {/* Main mockup display */}
            <motion.div
              className="relative bg-gradient-to-br from-muted via-muted/50 to-secondary rounded-3xl p-5 sm:p-6 lg:p-10 flex items-center justify-center min-h-[360px] sm:min-h-[440px] lg:min-h-[520px] overflow-hidden"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              {showMissingTemplateBadge && (
                <div
                  className="absolute top-4 left-4 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-sm"
                  role="status"
                >
                  Template missing: preview limited
                </div>
              )}
              {/* Background pattern for visual interest */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 1px)`,
                backgroundSize: "24px 24px"
              }} />
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, scale: 0.9, rotateY: activeView === "angled" ? -30 : 10 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  className="relative"
                  style={{ perspective: "1200px" }}
                >
                  {/* Realistic 3D Phone Case Mockup */}
                  <div className="relative w-64 sm:w-72 md:w-80 lg:w-96">
                    {/* Large ambient shadow */}
                    <div 
                      className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-b from-black/10 to-black/40 blur-3xl translate-y-8 scale-[0.85]"
                    />
                    
                    {/* Mockup image with design overlay */}
                    <div className="relative">
                      <img
                        src={baseImageSrc}
                        alt={`${variant.brand} ${variant.model} custom case ${resolvedActiveView} preview`}
                        className="w-full h-auto drop-shadow-2xl relative z-10"
                        draggable={false}
                      />
                      
                      {/* Design overlay - positioned to match case surface */}
                      {designPreview && !useMockupPreview && (
                        <div 
                          className={`absolute z-[20] overflow-hidden ${
                            resolvedActiveView === "front"
                              ? isApple 
                                ? "inset-[4%] rounded-[2rem]" 
                                : "inset-[3%] rounded-[1.5rem]"
                              : isApple
                                ? "top-[10%] left-[15%] right-[20%] bottom-[8%] rounded-[1.5rem]"
                                : "top-[8%] left-[12%] right-[18%] bottom-[6%] rounded-[1.2rem]"
                          }`}
                          style={{
                            transform: resolvedActiveView === "angled"
                              ? "perspective(1000px) rotateY(-8deg) rotateX(3deg)" 
                              : undefined,
                          }}
                        >
                          <img
                            src={designPreview}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {showPreviewLoader && (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center"
                  role="status"
                  aria-live="polite"
                >
                  <div className="rounded-2xl bg-card/90 px-6 py-5 shadow-lg backdrop-blur-sm border border-border">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full border-2 border-cta border-t-transparent animate-spin" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Printing your preview...</p>
                        <p className="text-xs text-muted-foreground">This can take a few seconds.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {(edmPreviewLoading || (edmPreviewError && showPreviewError)) && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {edmPreviewLoading && "Generating EDM preview..."}
                {edmPreviewError && showPreviewError && (
                  <div className="space-y-2">
                    <div>
                      {designPreview
                        ? "Updating preview..."
                        : `EDM preview unavailable: ${edmPreviewError}`}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={handleRetryPreview}
                    >
                      Retry Preview
                    </Button>
                  </div>
                )}
              </div>
            )}

            {showViewControls && (
              <>
                {/* View toggles - pill style */}
                <div className="flex items-center justify-center mt-6">
                  <div className="inline-flex rounded-full bg-muted p-1">
                    {mockupViews.map((item) => {
                      return (
                        <button
                          key={item.view}
                          onClick={() => setActiveView(item.view)}
                          aria-pressed={activeView === item.view}
                          className={`
                            relative flex min-h-11 items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200
                            ${activeView === item.view
                              ? "bg-card text-foreground shadow-sm" 
                              : "text-muted-foreground"
                            }
                            hover:text-foreground
                          `}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Thumbnail strip for quick preview */}
                <div className="flex items-center justify-center gap-3 mt-4">
                  {mockupViews.map((item) => {
                    const thumbnailSrc =
                      item.view === "angled" && designPreviewAngled
                        ? designPreviewAngled
                        : getMockupImage(variant.brand);
                    return (
                      <button
                        key={`thumb-${item.view}`}
                        onClick={() => setActiveView(item.view)}
                        aria-label={`Show ${item.name.toLowerCase()} preview`}
                        aria-pressed={activeView === item.view}
                        className={`
                          relative w-16 h-20 rounded-xl overflow-hidden transition-all duration-200 bg-muted
                          ${activeView === item.view
                            ? "ring-2 ring-cta ring-offset-2 ring-offset-background" 
                            : "opacity-60 hover:opacity-100"
                          }
                        `}
                      >
                        <img
                          src={thumbnailSrc}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Product Details */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="space-y-8"
            >
              {/* Product title */}
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-cta/10 text-cta-emphasis text-xs font-medium mb-3">
                  Custom Design
                </span>
                <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                  {variant.brand} {variant.model}
                </h1>
                <p className="text-lg text-muted-foreground">
                  Snap Case • Your custom design
                </p>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">${variant.price.toFixed(2)}</span>
                <span className="text-lg text-muted-foreground">USD</span>
              </div>

              {/* Features */}
              <div className="grid gap-4">
                <div
                  className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border"
                  data-preview-purchase-state={purchaseState}
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cta/20 to-cta/10 flex items-center justify-center shrink-0">
                    <Eye className="w-5 h-5 text-cta-emphasis" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-semibold mb-1">
                      {currentDesignInCart
                        ? "Ready for checkout"
                        : currentDesignReady
                          ? "Preview ready"
                          : "Preparing your preview"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {currentDesignInCart
                        ? "Your saved preview is in the cart. Continue when you are ready to review checkout details."
                        : currentDesignReady
                          ? `Review your artwork on the selected ${variant.model} case before adding it to your cart.`
                          : `We are generating the production preview for your ${variant.model} case.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cta/20 to-cta/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-cta-emphasis" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-semibold mb-1">Checkout details</h2>
                    <p className="text-sm text-muted-foreground">
                      Confirm shipping details and the final order total during secure Stripe checkout.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4">
                <Button
                  size="xl"
                  className={`w-full h-14 text-lg font-semibold ${
                    currentDesignInCart
                      ? "bg-success hover:bg-success/90"
                      : "bg-cta hover:bg-cta/90"
                  } text-cta-foreground shadow-lg shadow-cta/25`}
                  onClick={handlePrimaryPurchaseAction}
                  disabled={currentDesignInCart ? !canProceedToCheckout : !currentDesignReady}
                  aria-describedby="preview-purchase-status"
                >
                  {currentDesignInCart ? (
                    <>
                      <Check className="w-5 h-5 mr-2" aria-hidden="true" />
                      Continue to Checkout
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5 mr-2" aria-hidden="true" />
                      Add to Cart — ${variant.price.toFixed(2)}
                    </>
                  )}
                </Button>
                <p
                  id="preview-purchase-status"
                  className="text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {purchaseStatus}
                </p>
                
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleSaveDesign}
                  disabled={isSavingDesign}
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  {isSavingDesign ? "Saving..." : "Save Design"}
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate("/catalog")}
                  >
                    New Design
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate(editorPath)}
                  >
                    Edit Design
                  </Button>
                </div>
              </div>

              {/* Trust badge */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground text-center">
                  Review the model, artwork, and price before continuing to checkout.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Preview;
