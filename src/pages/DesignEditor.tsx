import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";
import { CaseCanvas } from "@/components/editor/CaseCanvas";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { DpiIndicator, getDpiQuality } from "@/components/editor/DpiIndicator";
import { useEditorState } from "@/hooks/useEditorState";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowLeft, ShoppingCart } from "lucide-react";

const DesignEditor = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);

  const {
    canvasRef,
    activeTool,
    currentDpi,
    hasImage,
    handleToolChange,
    handleImageUpload,
    handleFitImage,
    handleRotateImage,
    handleReset,
    handleDpiChange,
    getPreviewData,
  } = useEditorState();

  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      navigate("/catalog");
    }
  }, [variantId, navigate]);

  const handleContinue = () => {
    if (!variant) return;
    const previewData = getPreviewData();
    sessionStorage.setItem("designPreview", previewData);
    sessionStorage.setItem("designVariant", variantId || "");
    navigate(`/preview/${variantId}`);
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
      {/* Mobile Header */}
      {isMobile && (
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 z-40">
          <button
            onClick={() => navigate("/catalog")}
            className="flex items-center gap-2 text-muted-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="font-medium">
            Design Your Case{" "}
            <span className="text-muted-foreground">(2/2)</span>
          </div>
          <div className="w-8" /> {/* Spacer for centering */}
        </header>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 z-40">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cta flex items-center justify-center">
                <span className="text-cta-foreground font-bold text-sm">S</span>
              </div>
              <span className="font-display font-bold text-lg text-foreground">
                Snap
              </span>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
            <Link
              to="/catalog"
              className="text-muted-foreground hover:text-foreground"
            >
              Gallery
            </Link>
            <Link to="#" className="text-muted-foreground hover:text-foreground">
              My Account
            </Link>
            <ThemeToggle />
          </nav>
        </header>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Toolbar */}
        {!isMobile && (
          <EditorToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            onImageUpload={handleImageUpload}
            onFitImage={handleFitImage}
            onRotateImage={handleRotateImage}
            onReset={handleReset}
            isMobile={false}
            hasImage={hasImage}
          />
        )}

        {/* Canvas Area */}
        <main className="flex-1 flex flex-col bg-muted/30 relative">
          {/* Desktop DPI & Info Bar */}
          {!isMobile && (
            <div className="absolute top-4 left-4 z-20">
              <DpiIndicator dpi={currentDpi} />
            </div>
          )}

          <CaseCanvas
            ref={canvasRef}
            variant={variant}
            onDpiChange={handleDpiChange}
            className={isMobile ? "pb-32" : ""}
          />

          {/* Desktop Footer Actions */}
          {!isMobile && (
            <div className="absolute bottom-6 right-6 flex items-center gap-3 z-20">
              <Button variant="outline" size="lg">
                Save Design
              </Button>
              <Button
                className="bg-cta hover:bg-cta/90 text-cta-foreground gap-2"
                size="lg"
                onClick={handleContinue}
              >
                <ShoppingCart className="w-4 h-4" />
                Add to Cart
              </Button>
            </div>
          )}

          {/* Desktop Footer Info */}
          {!isMobile && (
            <footer className="absolute bottom-6 left-6 text-xs text-muted-foreground">
              © 2024 Snap. All rights reserved.
            </footer>
          )}
        </main>
      </div>

      {/* Mobile Toolbar */}
      {isMobile && (
        <>
          <EditorToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            onImageUpload={handleImageUpload}
            onFitImage={handleFitImage}
            onRotateImage={handleRotateImage}
            onReset={handleReset}
            isMobile={true}
            hasImage={hasImage}
          />
          {/* Mobile CTA Button - Above toolbar */}
          <div className="fixed bottom-[76px] left-0 right-0 px-4 pb-2 bg-gradient-to-t from-card to-transparent pt-4 z-40">
            <Button
              className="w-full bg-cta hover:bg-cta/90 text-cta-foreground h-12 text-base font-medium rounded-xl"
              onClick={handleContinue}
            >
              Next: Review
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default DesignEditor;
