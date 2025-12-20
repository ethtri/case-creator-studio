import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas as FabricCanvas, FabricImage, FabricText, Rect, Circle } from "fabric";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { toast } from "sonner";
import {
  Sparkles,
  Type,
  Image,
  Square,
  CircleIcon,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Layers,
  ZoomIn,
  ZoomOut,
  Move,
  AlertTriangle,
  Upload,
  Eye,
} from "lucide-react";

interface DesignElement {
  id: string;
  type: string;
  name: string;
}

const DesignEditor = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [activeColor, setActiveColor] = useState("#000000");
  const [activeTool, setActiveTool] = useState<"select" | "text" | "rect" | "circle">("select");
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [canvasZoom, setCanvasZoom] = useState(0.5);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate canvas dimensions based on print area
  const CANVAS_SCALE = 0.2; // Scale down for display
  const canvasWidth = variant ? variant.printAreaWidth * CANVAS_SCALE : 400;
  const canvasHeight = variant ? variant.printAreaHeight * CANVAS_SCALE : 600;

  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      navigate("/catalog");
    }
  }, [variantId, navigate]);

  useEffect(() => {
    if (!canvasRef.current || !variant) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#ffffff",
      selection: true,
    });

    // Add safe area guides
    const safeAreaMargin = 20;
    const safeArea = new Rect({
      left: safeAreaMargin,
      top: safeAreaMargin,
      width: canvasWidth - safeAreaMargin * 2,
      height: canvasHeight - safeAreaMargin * 2,
      fill: "transparent",
      stroke: "#22c55e",
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    canvas.add(safeArea);

    setFabricCanvas(canvas);
    toast.success("Canvas ready! Start designing your case.");

    return () => {
      canvas.dispose();
    };
  }, [variant, canvasWidth, canvasHeight]);

  // Update elements list when canvas changes
  useEffect(() => {
    if (!fabricCanvas) return;

    const updateElements = () => {
      const objects = fabricCanvas.getObjects();
      const newElements: DesignElement[] = [];
      objects.forEach((obj, index) => {
        if (obj.selectable) {
          newElements.push({
            id: `element-${index}`,
            type: obj.type || "unknown",
            name: obj.type === "i-text" ? "Text" : obj.type === "image" ? "Image" : `Shape ${index}`,
          });
        }
      });
      setElements(newElements);
    };

    fabricCanvas.on("object:added", updateElements);
    fabricCanvas.on("object:removed", updateElements);
    fabricCanvas.on("object:modified", updateElements);

    return () => {
      fabricCanvas.off("object:added", updateElements);
      fabricCanvas.off("object:removed", updateElements);
      fabricCanvas.off("object:modified", updateElements);
    };
  }, [fabricCanvas]);

  const handleAddText = () => {
    if (!fabricCanvas) return;
    const text = new FabricText("Your Text", {
      left: canvasWidth / 2,
      top: canvasHeight / 2,
      fontSize: 24,
      fill: activeColor,
      fontFamily: "Inter",
      originX: "center",
      originY: "center",
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    setActiveTool("select");
  };

  const handleAddRect = () => {
    if (!fabricCanvas) return;
    const rect = new Rect({
      left: canvasWidth / 2,
      top: canvasHeight / 2,
      width: 80,
      height: 80,
      fill: activeColor,
      originX: "center",
      originY: "center",
    });
    fabricCanvas.add(rect);
    fabricCanvas.setActiveObject(rect);
    setActiveTool("select");
  };

  const handleAddCircle = () => {
    if (!fabricCanvas) return;
    const circle = new Circle({
      left: canvasWidth / 2,
      top: canvasHeight / 2,
      radius: 40,
      fill: activeColor,
      originX: "center",
      originY: "center",
    });
    fabricCanvas.add(circle);
    fabricCanvas.setActiveObject(circle);
    setActiveTool("select");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fabricCanvas) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imgUrl = event.target?.result as string;
      
      try {
        const img = await FabricImage.fromURL(imgUrl);
        
        // Scale image to fit canvas
        const scale = Math.min(
          (canvasWidth * 0.8) / (img.width || 1),
          (canvasHeight * 0.8) / (img.height || 1)
        );
        img.scale(scale);
        img.set({
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          originX: "center",
          originY: "center",
        });

        // Check resolution
        if ((img.width || 0) < 500 || (img.height || 0) < 500) {
          setWarnings((prev) => [...prev, "Low resolution image detected. May appear pixelated when printed."]);
        }

        fabricCanvas.add(img);
        fabricCanvas.setActiveObject(img);
        toast.success("Image added to canvas");
      } catch (error) {
        toast.error("Failed to load image");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = () => {
    if (!fabricCanvas) return;
    const activeObject = fabricCanvas.getActiveObject();
    if (activeObject && activeObject.selectable) {
      fabricCanvas.remove(activeObject);
      toast.success("Element deleted");
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    const objects = fabricCanvas.getObjects();
    objects.forEach((obj) => {
      if (obj.selectable) {
        fabricCanvas.remove(obj);
      }
    });
    setWarnings([]);
    toast.success("Canvas cleared");
  };

  const handleZoomIn = () => {
    setCanvasZoom((prev) => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setCanvasZoom((prev) => Math.max(prev - 0.1, 0.3));
  };

  const handlePreview = () => {
    if (!fabricCanvas) return;
    // Export canvas to data URL for preview
    const dataUrl = fabricCanvas.toDataURL({
      multiplier: 1,
      format: "png",
      quality: 1,
    });
    // Store in session for preview page
    sessionStorage.setItem("designPreview", dataUrl);
    sessionStorage.setItem("designVariant", variantId || "");
    navigate(`/preview/${variantId}`);
  };

  const colorPresets = [
    "#000000",
    "#ffffff",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
  ];

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken flex flex-col">
      {/* Top Bar */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold">CaseStudio</span>
          </Link>
          <div className="h-6 w-px bg-border" />
          <div className="text-sm">
            <span className="text-muted-foreground">Designing for </span>
            <span className="font-medium">{variant.brand} {variant.model}</span>
            <span className="text-muted-foreground"> • </span>
            <span className="font-medium">{variant.color}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="w-4 h-4 mr-1" />
            Preview
          </Button>
          <Button variant="accent" size="sm" onClick={handlePreview}>
            Continue to Checkout
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Tools Panel */}
        <aside className="w-64 bg-card border-r border-border p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h3 className="text-sm font-medium mb-3">Tools</h3>
            <div className="grid grid-cols-4 gap-2">
              <Button
                variant={activeTool === "select" ? "tool-active" : "tool"}
                size="icon"
                onClick={() => setActiveTool("select")}
                title="Select"
              >
                <Move className="w-4 h-4" />
              </Button>
              <Button
                variant="tool"
                size="icon"
                onClick={handleAddText}
                title="Add Text"
              >
                <Type className="w-4 h-4" />
              </Button>
              <Button
                variant="tool"
                size="icon"
                onClick={handleAddRect}
                title="Add Rectangle"
              >
                <Square className="w-4 h-4" />
              </Button>
              <Button
                variant="tool"
                size="icon"
                onClick={handleAddCircle}
                title="Add Circle"
              >
                <CircleIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Upload Image</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </Button>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Colors</h3>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    activeColor === color ? "border-accent scale-110" : "border-border"
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setActiveColor(color)}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Actions</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleClear}>
                Clear All
              </Button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Zoom</h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={handleZoomOut}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground flex-1 text-center">
                {Math.round(canvasZoom * 100)}%
              </span>
              <Button variant="outline" size="icon-sm" onClick={handleZoomIn}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-warning mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Warnings</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 flex items-center justify-center p-8 overflow-auto bg-canvas-bg">
          <motion.div
            className="relative"
            style={{ transform: `scale(${canvasZoom})` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Phone frame */}
            <div
              className="relative rounded-[32px] shadow-strong p-3"
              style={{ backgroundColor: variant.colorHex }}
            >
              <div className="rounded-[28px] overflow-hidden shadow-inner bg-card">
                <canvas ref={canvasRef} className="block" />
              </div>
              {/* Notch */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full bg-foreground/20" />
            </div>

            {/* Safe area indicator */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-canvas-safe rounded" />
                <span className="text-muted-foreground">Safe Area</span>
              </div>
            </div>
          </motion.div>
        </main>

        {/* Right Panel - Layers & Properties */}
        <aside className="w-64 bg-card border-l border-border p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4" />
              <h3 className="text-sm font-medium">Layers</h3>
            </div>
            {elements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No elements yet. Add some from the tools panel.
              </p>
            ) : (
              <div className="space-y-1">
                {elements.map((element) => (
                  <div
                    key={element.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50 text-sm"
                  >
                    {element.type === "i-text" && <Type className="w-3 h-3" />}
                    {element.type === "image" && <Image className="w-3 h-3" />}
                    {element.type === "rect" && <Square className="w-3 h-3" />}
                    {element.type === "circle" && <CircleIcon className="w-3 h-3" />}
                    <span>{element.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto">
            <div className="bg-secondary/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Print Specifications</h4>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Print Area</dt>
                  <dd>{variant.printAreaWidth} × {variant.printAreaHeight}px</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Recommended DPI</dt>
                  <dd>300</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default DesignEditor;
