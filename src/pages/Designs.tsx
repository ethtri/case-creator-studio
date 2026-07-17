import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RequireAuth } from "@/components/RequireAuth";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { supabase } from "@/integrations/supabase/client";
import { getVariantById } from "@/data/phoneVariants";
import { toast } from "sonner";
import { Palette, Trash2 } from "lucide-react";

type SavedDesign = {
  id: string;
  designId: string;
  variantId: string;
  edmTemplateId: number | null;
  externalProductId: string | null;
  previewUrl: string;
  previewUrlAngled: string | null;
  source: string;
  updatedAt: string;
};

const EDM_PREVIEW_CACHE_VERSION = "v4";

const buildDesignKey = (id: string, suffix: string) => `edmDesign:${id}:${suffix}`;

const DesignsContent = () => {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchDesigns = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("list-designs");
    if (error) {
      toast.error("Unable to load saved designs.");
      setIsLoading(false);
      return;
    }

    setDesigns(data?.designs || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDesigns();
  }, []);

  const handleResume = (design: SavedDesign) => {
    sessionStorage.setItem("edmDesign:last", design.designId);
    sessionStorage.setItem(buildDesignKey(design.designId, "variantId"), design.variantId);
    if (design.edmTemplateId) {
      sessionStorage.setItem(buildDesignKey(design.designId, "templateId"), design.edmTemplateId.toString());
    }
    if (design.externalProductId) {
      sessionStorage.setItem(buildDesignKey(design.designId, "externalProductId"), design.externalProductId);
    }
    sessionStorage.setItem(buildDesignKey(design.designId, "preview"), design.previewUrl);
    if (design.previewUrlAngled) {
      sessionStorage.setItem(buildDesignKey(design.designId, "previewAngled"), design.previewUrlAngled);
    }
    sessionStorage.setItem(buildDesignKey(design.designId, "previewKind"), "mockup");
    sessionStorage.setItem(buildDesignKey(design.designId, "previewVersion"), EDM_PREVIEW_CACHE_VERSION);
    sessionStorage.setItem(buildDesignKey(design.designId, "previewGeneratedAt"), Date.now().toString());
    sessionStorage.removeItem(buildDesignKey(design.designId, "previewDirtyAt"));

    navigate(`/design/${design.variantId}?designId=${design.designId}`);
  };

  const handleDelete = async (designId: string) => {
    setIsDeleting(designId);
    const { error } = await supabase.functions.invoke("delete-design", {
      body: { id: designId },
    });

    if (error) {
      toast.error("Unable to delete design.");
    } else {
      setDesigns((prev) => prev.filter((design) => design.id !== designId));
      toast.success("Design removed.");
    }
    setIsDeleting(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2">
            <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 pt-12 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Designs</h1>
              <p className="text-muted-foreground">
                Resume, edit, or reorder your saved Snapcase designs.
              </p>
            </div>
            <Button asChild className="bg-cta hover:bg-cta/90 text-cta-foreground">
              <Link to="/catalog">
                Start New Design
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div
              className="text-center py-16 bg-card rounded-2xl shadow-soft"
              role="status"
              aria-live="polite"
            >
              <div className="animate-spin w-8 h-8 border-2 border-cta border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading your designs...</p>
            </div>
          ) : designs.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
              <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">No designs saved yet</h2>
              <p className="text-muted-foreground mb-6">
                Save a design from the preview screen to access it anytime.
              </p>
              <Button asChild className="bg-cta hover:bg-cta/90 text-cta-foreground">
                <Link to="/catalog">
                  Start Designing
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {designs.map((design, index) => {
                const variant = getVariantById(design.variantId);
                return (
                  <motion.div
                    key={design.id}
                    className="bg-card rounded-2xl p-5 shadow-soft border border-border"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                  >
                    <img
                      src={design.previewUrl}
                      alt={`${variant ? `${variant.brand} ${variant.model}` : "Custom phone case"} saved design preview`}
                      className="h-48 w-full rounded-xl bg-muted mb-4 object-cover"
                    />
                    <div className="space-y-2 mb-4">
                      <h2 className="font-semibold">
                        {variant ? `${variant.brand} ${variant.model}` : "Custom Phone Case"}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(design.updatedAt).toLocaleDateString()}
                      </p>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {design.source === "purchase" ? "Purchased" : "Saved"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        className="flex-1 bg-cta hover:bg-cta/90 text-cta-foreground"
                        onClick={() => handleResume(design)}
                      >
                        Resume
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isDeleting === design.id}
                        onClick={() => handleDelete(design.id)}
                        aria-label={`Delete ${variant ? `${variant.brand} ${variant.model}` : "custom phone case"} design`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

const Designs = () => (
  <RequireAuth>
    <DesignsContent />
  </RequireAuth>
);

export default Designs;
