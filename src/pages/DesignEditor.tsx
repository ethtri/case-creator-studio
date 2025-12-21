import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";
import { CaseCanvas } from "@/components/editor/CaseCanvas";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { DpiIndicator, getDpiQuality } from "@/components/editor/DpiIndicator";
import { FillColorPicker } from "@/components/editor/FillColorPicker";
import { ClipartPicker } from "@/components/editor/ClipartPicker";
import { TextStyler } from "@/components/editor/TextStyler";
import { LayersPanel } from "@/components/editor/LayersPanel";
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
    textStyle,
    hasSelectedText,
    currentDpi,
    hasImage,
    backgroundFill,
    layers,
    canUndo,
    canRedo,
    handleToolChange,
    handleSelectionChange,
    handleTextStyleChange,
    handleLayersChange,
    handleHistoryChange,
    handleToggleLayerVisibility,
    handleMoveLayerUp,
    handleMoveLayerDown,
    handleSelectLayer,
    handleDeleteLayer,
    handleAddClipart,
    handleImageUpload,
    handleFitImage,
    handleRotateImage,
    handleReset,
    handleDpiChange,
    handleBackgroundFillChange,
    handleUndo,
    handleRedo,
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
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
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
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
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

          {/* Fill Color Picker Panel - Desktop */}
          {!isMobile && (
            <AnimatePresence>
              {activeTool === "fill" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-4 left-20 z-30"
                >
                  <FillColorPicker
                    currentFill={backgroundFill}
                    onFillChange={handleBackgroundFillChange}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Layers Panel - Desktop */}
          {!isMobile && (
            <AnimatePresence>
              {activeTool === "layers" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-4 left-20 z-30"
                >
                  <LayersPanel
                    layers={layers}
                    onToggleVisibility={handleToggleLayerVisibility}
                    onMoveUp={handleMoveLayerUp}
                    onMoveDown={handleMoveLayerDown}
                    onSelect={handleSelectLayer}
                    onDelete={handleDeleteLayer}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Clipart Picker Panel - Desktop */}
          {!isMobile && (
            <AnimatePresence>
              {activeTool === "clipart" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-4 left-20 z-30"
                >
                  <ClipartPicker onSelect={handleAddClipart} />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Text Styler Panel - Desktop */}
          {!isMobile && (
            <AnimatePresence>
              {activeTool === "text" && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-4 left-20 z-30"
                >
                  <TextStyler
                    currentStyle={textStyle}
                    onStyleChange={handleTextStyleChange}
                    hasSelectedText={hasSelectedText}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}

        <CaseCanvas
          ref={canvasRef}
          variant={variant}
          onDpiChange={handleDpiChange}
          onSelectionChange={handleSelectionChange}
          onLayersChange={handleLayersChange}
          onHistoryChange={handleHistoryChange}
          className={isMobile ? "pb-44" : ""}
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
            <footer className="absolute bottom-6 left-6 text-xs text-muted-foreground z-10">
              © 2024 snapcase.ai
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
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            isMobile={true}
            hasImage={hasImage}
          />
          {/* Mobile CTA Button - Above toolbar */}
          <div className="fixed bottom-[56px] left-0 right-0 z-40">
            {/* Mobile Tool Panels */}
            <AnimatePresence>
              {(activeTool === "fill" || activeTool === "layers" || activeTool === "clipart" || activeTool === "text") && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="mx-4 mb-3 max-h-[40vh] overflow-auto"
                >
                  {activeTool === "fill" && (
                    <FillColorPicker
                      currentFill={backgroundFill}
                      onFillChange={handleBackgroundFillChange}
                    />
                  )}
                  {activeTool === "layers" && (
                    <LayersPanel
                      layers={layers}
                      onToggleVisibility={handleToggleLayerVisibility}
                      onMoveUp={handleMoveLayerUp}
                      onMoveDown={handleMoveLayerDown}
                      onSelect={handleSelectLayer}
                      onDelete={handleDeleteLayer}
                    />
                  )}
                  {activeTool === "clipart" && (
                    <ClipartPicker onSelect={handleAddClipart} />
                  )}
                  {activeTool === "text" && (
                    <TextStyler
                      currentStyle={textStyle}
                      onStyleChange={handleTextStyleChange}
                      hasSelectedText={hasSelectedText}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* CTA Button */}
            <div className="px-4 pb-2 bg-gradient-to-t from-card via-card/80 to-transparent pt-3">
              <Button
                className="w-full bg-cta hover:bg-cta/90 text-cta-foreground h-11 text-base font-medium rounded-xl shadow-lg"
                onClick={handleContinue}
              >
                Next: Review
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DesignEditor;
