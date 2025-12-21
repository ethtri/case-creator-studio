import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";
import { ArrowLeft, Loader2, AlertCircle, ExternalLink } from "lucide-react";
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

interface PFDesignMakerConfig {
  elemId: string;
  nonce: string;
  externalProductId: string;
  initProduct: {
    productId: number;
    variantIds?: number[];
  };
  onTemplateSaved?: (templateId: number) => void;
  onDesignStatusUpdate?: (status: { hasDesign: boolean }) => void;
  onIframeLoaded?: () => void;
  onError?: (error: unknown) => void;
  debug?: boolean;
}

interface PFDesignMakerInstance {
  sendMessage: (message: { action: string }) => void;
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
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const designMakerRef = useRef<PFDesignMakerInstance | null>(null);
  const scriptLoadedRef = useRef(false);

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
    if (!variant || !window.PFDesignMaker) {
      console.log('Waiting for variant or PFDesignMaker...', { variant: !!variant, PFDesignMaker: !!window.PFDesignMaker });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const externalProductId = `snapcase-${variantId}-${Date.now()}`;
      const productId = getProductId(variant.brand);

      console.log('Requesting nonce for:', { externalProductId, productId, variantId: variant.printfulVariantId });

      // Get nonce from our edge function
      const { data, error: nonceError } = await supabase.functions.invoke('edm-nonce', {
        body: { 
          externalProductId,
          productId,
        },
      });

      if (nonceError || !data?.nonce) {
        console.error('Failed to get nonce:', nonceError, data);
        throw new Error(data?.error || nonceError?.message || 'Failed to get authentication token');
      }

      console.log('Nonce received, initializing EDM...');

      // Create the design maker instance
      designMakerRef.current = new window.PFDesignMaker({
        elemId: 'printful-designer',
        nonce: data.nonce,
        externalProductId,
        initProduct: {
          productId,
          variantIds: [variant.printfulVariantId],
        },
        onTemplateSaved: (id: number) => {
          console.log('Template saved:', id);
          setTemplateId(id);
          toast.success('Design saved!');
          // Store template ID for checkout
          sessionStorage.setItem('edmTemplateId', id.toString());
          sessionStorage.setItem('designVariant', variantId || '');
        },
        onDesignStatusUpdate: (status) => {
          console.log('Design status updated:', status);
        },
        onIframeLoaded: () => {
          console.log('Iframe loaded');
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
  }, [variant, variantId]);

  // Fetch variant and initialize
  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      navigate("/catalog");
    }
  }, [variantId, navigate]);

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

  const handleSaveDesign = () => {
    if (designMakerRef.current) {
      designMakerRef.current.sendMessage({ action: 'saveDesign' });
    }
  };

  const handleContinue = () => {
    if (templateId) {
      navigate(`/preview/${variantId}`);
    } else {
      toast.info('Please save your design first');
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
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 z-40 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
            EDM Mode
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <Link 
            to={`/design/${variantId}`} 
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Canvas Editor
          </Link>
          <ThemeToggle />
          <CartSheet />
        </nav>
      </header>

      {/* Product info bar */}
      <div className="h-10 bg-card/50 border-b border-border flex items-center justify-center px-4 shrink-0">
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
        <div 
          id="printful-designer" 
          className="flex-1 w-full"
          style={{ 
            opacity: iframeLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out',
          }}
        />

        {/* Footer Actions */}
        <div className="h-16 bg-card border-t border-border flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-muted-foreground">
            {templateId ? (
              <span className="text-success">✓ Design saved (Template #{templateId})</span>
            ) : (
              <span>Design your case using Printful's tools</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSaveDesign}>
              Save Design
            </Button>
            <Button 
              className="bg-cta hover:bg-cta/90 text-cta-foreground"
              onClick={handleContinue}
            >
              Continue to Preview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DesignEditorEDM;
