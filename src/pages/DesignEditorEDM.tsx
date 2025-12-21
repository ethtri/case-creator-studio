import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Printful product IDs for snap cases
const PRINTFUL_PRODUCT_IDS = {
  // iPhone Snap Case product ID
  'iphone': 683,
  // Samsung Snap Case product ID  
  'samsung': 684,
};

const getProductId = (brand: string): number => {
  return brand.toLowerCase() === 'apple' ? PRINTFUL_PRODUCT_IDS.iphone : PRINTFUL_PRODUCT_IDS.samsung;
};

const extractNonce = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as { nonce?: unknown; result?: { nonce?: unknown } };
  const rawNonce = data.nonce ?? data.result?.nonce;

  if (typeof rawNonce === "string") {
    return rawNonce;
  }

  if (rawNonce && typeof rawNonce === "object") {
    const nested = rawNonce as { nonce?: unknown; value?: unknown; token?: unknown };
    const candidate = nested.nonce ?? nested.value ?? nested.token;
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
};

interface PFDesignMakerConfig {
  elemId: string;
  nonce: string;
  externalProductId: string;
  initProduct?: {
    productId: number;
    technique?: string;
    variantIds?: number[];
  };
  isVariantSelectionDisabled?: boolean;
  allowOnlyOneColorToBeSelected?: boolean;
  allowOnlyOneSizeToBeSelected?: boolean;
  preselectedSizes?: string[];
  steps?: string[];
  onTemplateSaved?: (templateId: number) => void;
  onDesignStatusUpdate?: (status: { hasDesign: boolean; designChange?: boolean; designValid?: boolean }) => void;
  onIframeLoaded?: () => void;
  onError?: (error: unknown) => void;
  debug?: boolean;
}

interface PFDesignMakerInstance {
  sendMessage: (message: { action: string } | { event: string; [key: string]: unknown }) => void;
}

declare global {
  interface Window {
    PFDesignMaker: {
      new (config: PFDesignMakerConfig): PFDesignMakerInstance;
    };
  }
}

const DesignEditorEDM = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);
  const designMakerRef = useRef<PFDesignMakerInstance | null>(null);
  const continueAfterSaveRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const templateIdRef = useRef<number | null>(null);
  const lastAutoSaveAtRef = useRef(0);
  const hasUnsavedChangesRef = useRef(false);
  const designValidRef = useRef(false);
  const scriptLoadedRef = useRef(false);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [designerHeight, setDesignerHeight] = useState<number | null>(null);
  const resizeIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!variantId) return;
    const paramDesignId = searchParams.get("designId");
    if (paramDesignId) {
      setDesignId(paramDesignId);
      sessionStorage.setItem("edmDesign:last", paramDesignId);
      sessionStorage.setItem(buildDesignKey(paramDesignId, "variantId"), variantId);
      return;
    }

    const nextDesignId = generateDesignId();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("designId", nextDesignId);
    setSearchParams(nextParams, { replace: true });
    setDesignId(nextDesignId);
    sessionStorage.setItem("edmDesign:last", nextDesignId);
    sessionStorage.setItem(buildDesignKey(nextDesignId, "variantId"), variantId);
  }, [variantId, searchParams, setSearchParams]);

  useEffect(() => {
    templateIdRef.current = null;
    setTemplateId(null);
    autoSaveInFlightRef.current = false;
  }, [designId]);

  const buildDesignKey = (id: string, suffix: string) => `edmDesign:${id}:${suffix}`;

  const getOrCreateExternalProductId = (id: string) => {
    const key = buildDesignKey(id, "externalProductId");
    const existing = sessionStorage.getItem(key);
    if (existing) {
      return existing;
    }
    const created = `snapcase-${id}-${Date.now()}`;
    sessionStorage.setItem(key, created);
    return created;
  };

  const getStoredTemplateId = (id: string) => {
    const raw = sessionStorage.getItem(buildDesignKey(id, "templateId"));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const generateDesignId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  // Load the Printful embed.js script
  useEffect(() => {
    if (scriptLoadedRef.current) return;
    
    const script = document.createElement('script');
    script.src = 'https://files.cdn.printful.com/embed/embed.js';
    script.async = true;
    script.onload = () => {
      console.log('Printful embed.js loaded');
      scriptLoadedRef.current = true;
    };
    script.onerror = () => {
      setError('Failed to load Printful Design Maker script');
      setLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove script on cleanup - it might be needed
    };
  }, []);

  // Initialize the design maker
  const initializeDesignMaker = useCallback(async () => {
    if (!variant || !window.PFDesignMaker || !variantId || !designId) {
      console.log('Waiting for variant or PFDesignMaker...', { variant: !!variant, PFDesignMaker: !!window.PFDesignMaker });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const externalProductId = getOrCreateExternalProductId(designId);
      const productId = getProductId(variant.brand);

      console.log('Requesting nonce for:', { externalProductId, productId, variantId: variant.printfulVariantId });

      // Get nonce from our edge function
      const { data, error: nonceError } = await supabase.functions.invoke('edm-nonce', {
        body: { 
          externalProductId,
          productId,
        },
      });

      const nonceValue = extractNonce(data);
      const templateIdFromNonce = typeof data?.templateId === "number" ? data.templateId : null;
      const cachedTemplateId = getStoredTemplateId(designId);
      const resolvedTemplateId = templateIdFromNonce ?? cachedTemplateId;

      if (nonceError || !nonceValue) {
        console.error('Failed to get nonce:', nonceError, data);
        throw new Error(data?.error || nonceError?.message || 'Failed to get authentication token');
      }

      console.log('Nonce received, initializing EDM...');

      if (resolvedTemplateId) {
        setTemplateId(resolvedTemplateId);
        templateIdRef.current = resolvedTemplateId;
        sessionStorage.setItem(buildDesignKey(designId, "templateId"), resolvedTemplateId.toString());
        sessionStorage.setItem(buildDesignKey(designId, "variantId"), variantId);
        sessionStorage.setItem("edmDesign:last", designId);
      }

      const initProduct = resolvedTemplateId
        ? undefined
        : {
            productId,
            technique: "SUBLIMATION",
            variantIds: [variant.printfulVariantId],
          };

      const applySelectedProduct = () => {
        if (initProduct) {
          designMakerRef.current?.sendMessage({ event: 'setProduct', ...initProduct });
        }
        designMakerRef.current?.sendMessage({ event: 'setSteps', steps: ['design'] });
      };

      // Create the design maker instance
      designMakerRef.current = new window.PFDesignMaker({
        elemId: 'printful-designer',
        nonce: nonceValue,
        externalProductId,
        ...(initProduct ? { initProduct } : {}),
        isVariantSelectionDisabled: true, // Disable variant selection to prevent product changes
        allowOnlyOneColorToBeSelected: true,
        allowOnlyOneSizeToBeSelected: true,
        preselectedSizes: [String(variant.printfulVariantId), variant.model],
        steps: ['design'], // Limit EDM navigation to the Design step
        onTemplateSaved: (id: number) => {
          console.log('Template saved:', id);
          setTemplateId(id);
          templateIdRef.current = id;
          setIsSaving(false);
          autoSaveInFlightRef.current = false;
          hasUnsavedChangesRef.current = false;
          if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          toast.success('Design saved!');
          // Store template ID for checkout
          sessionStorage.setItem(buildDesignKey(designId, "templateId"), id.toString());
          sessionStorage.setItem(buildDesignKey(designId, "variantId"), variantId);
          sessionStorage.setItem("edmDesign:last", designId);
          if (continueAfterSaveRef.current) {
            continueAfterSaveRef.current = false;
            navigate(`/preview/${variantId}?designId=${designId}`);
          }
        },
        onDesignStatusUpdate: (status) => {
          console.log('Design status updated:', status);
          const hasChanges = typeof status.designChange === "boolean"
            ? status.designChange
            : !templateIdRef.current && status.hasDesign;
          const isValid = typeof status.designValid === "boolean"
            ? status.designValid
            : status.hasDesign;
          const now = Date.now();
          const canAutoSave = now - lastAutoSaveAtRef.current > 1200;
          if (typeof status.designChange === "boolean") {
            hasUnsavedChangesRef.current = status.designChange;
          } else if (!templateIdRef.current && status.hasDesign) {
            hasUnsavedChangesRef.current = true;
          }
          designValidRef.current = isValid;
          if (hasChanges && isValid && !autoSaveInFlightRef.current && canAutoSave) {
            autoSaveInFlightRef.current = true;
            lastAutoSaveAtRef.current = now;
            handleSaveDesign();
          }
        },
        onIframeLoaded: () => {
          console.log('Iframe loaded');
          applySelectedProduct();
          window.setTimeout(applySelectedProduct, 250);
          setIframeLoaded(true);
          setLoading(false);
        },
        onError: (err) => {
          console.error('EDM error:', err);
          setError('An error occurred in the design maker');
          setLoading(false);
        },
        debug: true,
      });

    } catch (err) {
      console.error('Error initializing EDM:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize design maker');
      setLoading(false);
    }
  }, [variant, variantId, designId, navigate]);

  const updateDesignerHeight = useCallback(() => {
    const headerHeight = headerRef.current?.offsetHeight ?? 0;
    const infoHeight = infoRef.current?.offsetHeight ?? 0;
    const footerHeight = footerRef.current?.offsetHeight ?? 0;
    const available = window.innerHeight - headerHeight - infoHeight - footerHeight;
    setDesignerHeight(Math.max(available, 200));
  }, []);

  const forceEmbedSizing = useCallback(() => {
    const container = document.getElementById("printful-designer");
    if (!container) return;

    container.style.setProperty("height", designerHeight ? `${designerHeight}px` : "100%", "important");
    container.style.setProperty("min-height", designerHeight ? `${designerHeight}px` : "100%", "important");
    container.style.setProperty("width", "100%", "important");

    const children = container.querySelectorAll("*");
    children.forEach((child) => {
      const element = child as HTMLElement;
      element.style.setProperty("height", "100%", "important");
      element.style.setProperty("width", "100%", "important");
    });

    const iframe = container.querySelector("iframe");
    if (iframe) {
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "100%");
    }
  }, [designerHeight]);

  // Fetch variant and initialize
  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      navigate("/catalog");
    }
  }, [variantId, navigate]);

  useEffect(() => {
    updateDesignerHeight();
    window.addEventListener('resize', updateDesignerHeight);
    return () => window.removeEventListener('resize', updateDesignerHeight);
  }, [updateDesignerHeight]);

  useEffect(() => {
    forceEmbedSizing();
  }, [designerHeight, forceEmbedSizing]);

  // Initialize EDM when variant and script are ready
  useEffect(() => {
    if (variant && scriptLoadedRef.current && window.PFDesignMaker) {
      initializeDesignMaker();
    } else if (variant) {
      // Poll for script load
      const interval = setInterval(() => {
        if (window.PFDesignMaker) {
          clearInterval(interval);
          initializeDesignMaker();
        }
      }, 100);
      
      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!window.PFDesignMaker) {
          setError('Printful Design Maker failed to load. Please refresh the page.');
          setLoading(false);
        }
      }, 10000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [variant, initializeDesignMaker]);

  useEffect(() => {
    if (!iframeLoaded) return;
    forceEmbedSizing();
    if (resizeIntervalRef.current) {
      window.clearInterval(resizeIntervalRef.current);
    }
    resizeIntervalRef.current = window.setInterval(forceEmbedSizing, 500);
    return () => {
      if (resizeIntervalRef.current) {
        window.clearInterval(resizeIntervalRef.current);
        resizeIntervalRef.current = null;
      }
    };
  }, [iframeLoaded, forceEmbedSizing]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSaveDesign = () => {
    if (designMakerRef.current) {
      designMakerRef.current.sendMessage({ event: 'saveDesign' });
    }
  };

  const handleContinue = () => {
    if (templateId) {
      if (hasUnsavedChangesRef.current) {
        if (!designValidRef.current) {
          toast.info('Finish your design before continuing.');
          return;
        }
        continueAfterSaveRef.current = true;
        setIsSaving(true);
        toast.info('Saving your design...');
        if (saveTimeoutRef.current) {
          window.clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = window.setTimeout(() => {
          setIsSaving(false);
          continueAfterSaveRef.current = false;
          autoSaveInFlightRef.current = false;
          toast.error('Save timed out. Please try again.');
        }, 8000);
        autoSaveInFlightRef.current = true;
        lastAutoSaveAtRef.current = Date.now();
        handleSaveDesign();
        return;
      }
      if (variantId && designId) {
        navigate(`/preview/${variantId}?designId=${designId}`);
      } else if (variantId) {
        navigate(`/preview/${variantId}`);
      }
    } else {
      if (designValidRef.current === false && !hasUnsavedChangesRef.current) {
        toast.info('Finish your design before continuing.');
        return;
      }
      continueAfterSaveRef.current = true;
      setIsSaving(true);
      toast.info('Saving your design...');
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        setIsSaving(false);
        continueAfterSaveRef.current = false;
        autoSaveInFlightRef.current = false;
        toast.error('Save timed out. Please try again.');
      }, 8000);
      handleSaveDesign();
    }
  };

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-cta border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      {/* Header */}
      <header
        ref={headerRef}
        className="h-14 bg-card border-b border-border flex items-center justify-between px-6 z-40 shrink-0"
      >
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
            Editor
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <ThemeToggle />
          <CartSheet />
        </nav>
      </header>

      {/* Product info bar */}
      <div
        ref={infoRef}
        className="h-10 bg-card/50 border-b border-border flex items-center justify-center px-4 shrink-0"
      >
        <span className="text-sm text-muted-foreground">
          Designing: <span className="text-foreground font-medium">{variant.brand} {variant.model}</span>
          <span className="mx-2">•</span>
          Printful Snap Case
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Error State */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="max-w-md p-6 bg-card border border-border rounded-xl text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
              <h3 className="text-lg font-semibold">Unable to Load Design Maker</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => navigate('/catalog')}>
                  Back to Catalog
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Note: Printful EDM requires enterprise access. 
                <a 
                  href="https://www.printful.com/enterprise/embedded-design-maker" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 ml-1"
                >
                  Learn more <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <div>
                <p className="text-foreground font-medium">Loading Printful Design Maker</p>
                <p className="text-sm text-muted-foreground">This may take a few seconds...</p>
              </div>
            </div>
          </div>
        )}

        {/* Printful Designer Container */}
        <div className="relative flex-1 w-full">
          <div 
            id="printful-designer" 
            className="flex-1 w-full"
            style={{ 
              height: designerHeight ? `${designerHeight}px` : undefined,
              opacity: iframeLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out',
            }}
          />
        </div>

        {/* Footer Actions */}
        <div
          ref={footerRef}
          className="h-16 bg-card border-t border-border flex items-center justify-between px-6 shrink-0"
        >
          <div className="text-sm text-muted-foreground">
            {templateId ? (
              <span className="text-success">✓ Design saved (Template #{templateId})</span>
            ) : (
              <span>Design your case using Printful's tools</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button 
              className="bg-cta hover:bg-cta/90 text-cta-foreground"
              disabled={isSaving}
              onClick={handleContinue}
            >
              {isSaving ? "Saving..." : "Continue to Preview"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignEditorEDM;
