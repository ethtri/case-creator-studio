import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Canvas as FabricCanvas, FabricImage, FabricText, Rect, Gradient, loadSVGFromString, util, FabricObject } from "fabric";
import { PhoneVariant } from "@/data/phoneVariants";
import { DpiIndicator, getDpiQuality } from "./DpiIndicator";
import { cn } from "@/lib/utils";
import { FillValue } from "./FillColorPicker";
import { ClipartItem } from "@/data/clipartData";
import { TextStyle } from "./TextStyler";

// Printful requires 300 DPI - we work at full resolution internally
const TARGET_DPI = 300;
const PRINT_INCH_RATIO = TARGET_DPI; // pixels per inch at 300 DPI

export interface CaseCanvasRef {
  addText: (text: string, style: TextStyle) => void;
  addImage: (file: File) => Promise<void>;
  addClipart: (clipart: ClipartItem) => Promise<void>;
  updateSelectedTextStyle: (style: Partial<TextStyle>) => void;
  getSelectedTextStyle: () => TextStyle | null;
  fitImage: () => void;
  rotateImage: (degrees: number) => void;
  reset: () => void;
  exportForPrint: () => string;
  getPreview: () => string;
  hasImage: () => boolean;
  hasSelectedText: () => boolean;
  setBackgroundFill: (fill: FillValue) => void;
  getBackgroundFill: () => FillValue;
}

interface CaseCanvasProps {
  variant: PhoneVariant;
  className?: string;
  onDpiChange?: (dpi: number | null) => void;
  onSelectionChange?: (hasText: boolean, style: TextStyle | null) => void;
}

export const CaseCanvas = forwardRef<CaseCanvasRef, CaseCanvasProps>(
  ({ variant, className, onDpiChange, onSelectionChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
    const [currentDpi, setCurrentDpi] = useState<number | null>(null);
    const [canvasScale, setCanvasScale] = useState(1);

    // Calculate safe area (camera cutout region)
    const cameraHeight = Math.round(variant.printAreaHeight * 0.12);
    const cameraWidth = Math.round(variant.printAreaWidth * 0.35);
    const cameraPadding = 40;

    // Initialize canvas at display size, but track full resolution
    useEffect(() => {
      if (!canvasRef.current || !containerRef.current) return;

      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      // Calculate scale to fit container while maintaining aspect ratio
      const aspectRatio = variant.printAreaWidth / variant.printAreaHeight;
      let displayWidth = containerWidth * 0.85;
      let displayHeight = displayWidth / aspectRatio;

      if (displayHeight > containerHeight * 0.85) {
        displayHeight = containerHeight * 0.85;
        displayWidth = displayHeight * aspectRatio;
      }

      // Scale factor from display to print resolution
      const scale = variant.printAreaWidth / displayWidth;
      setCanvasScale(scale);

      const canvas = new FabricCanvas(canvasRef.current, {
        width: displayWidth,
        height: displayHeight,
        backgroundColor: "#f5f5f5",
        selection: true,
        preserveObjectStacking: true,
      });

      // Add camera cutout indicator (non-selectable)
      const scaledCameraWidth = cameraWidth / scale;
      const scaledCameraHeight = cameraHeight / scale;
      const scaledCameraPadding = cameraPadding / scale;

      const cameraRect = new Rect({
        left: displayWidth - scaledCameraWidth - scaledCameraPadding,
        top: scaledCameraPadding,
        width: scaledCameraWidth,
        height: scaledCameraHeight,
        fill: "rgba(80, 80, 80, 0.9)",
        stroke: "transparent",
        rx: 20 / scale,
        ry: 20 / scale,
        selectable: false,
        evented: false,
        name: "camera-cutout",
      });
      canvas.add(cameraRect);

      // Add "Camera" label
      const cameraLabel = new FabricText("Camera", {
        left: displayWidth - scaledCameraWidth - scaledCameraPadding + scaledCameraWidth / 2,
        top: scaledCameraPadding + scaledCameraHeight / 2,
        fontSize: 11 / scale * canvasScale,
        fill: "white",
        fontFamily: "Inter, sans-serif",
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        name: "camera-label",
      });
      canvas.add(cameraLabel);

      // Add safe area border (dashed pink outline like reference)
      const safeAreaPadding = 20 / scale;
      const safeArea = new Rect({
        left: safeAreaPadding,
        top: safeAreaPadding,
        width: displayWidth - safeAreaPadding * 2,
        height: displayHeight - safeAreaPadding * 2,
        fill: "transparent",
        stroke: "hsl(330, 75%, 60%)",
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        rx: 24 / scale,
        ry: 24 / scale,
        selectable: false,
        evented: false,
        name: "safe-area",
      });
      canvas.add(safeArea);

      // Handle selection changes
      const handleSelection = () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj && activeObj instanceof FabricText && activeObj.selectable) {
          const style: TextStyle = {
            fontFamily: (activeObj.fontFamily as string) || "Inter, sans-serif",
            fontSize: (activeObj.fontSize as number) || 32,
            color: (activeObj.fill as string) || "#000000",
            fontWeight: activeObj.fontWeight === "bold" ? "bold" : "normal",
            fontStyle: activeObj.fontStyle === "italic" ? "italic" : "normal",
            underline: activeObj.underline || false,
          };
          onSelectionChange?.(true, style);
        } else {
          onSelectionChange?.(false, null);
        }
      };

      canvas.on("selection:created", handleSelection);
      canvas.on("selection:updated", handleSelection);
      canvas.on("selection:cleared", () => onSelectionChange?.(false, null));

      setFabricCanvas(canvas);

      return () => {
        canvas.off("selection:created", handleSelection);
        canvas.off("selection:updated", handleSelection);
        canvas.off("selection:cleared");
        canvas.dispose();
      };
    }, [variant, cameraHeight, cameraWidth, cameraPadding, onSelectionChange]);

    // Calculate DPI when image is added/modified
    const calculateDpi = useCallback(
      (imgWidth: number, imgHeight: number, displayWidth: number, displayHeight: number) => {
        // The actual printed size in inches
        const printWidthInches = variant.printAreaWidth / TARGET_DPI;
        const printHeightInches = variant.printAreaHeight / TARGET_DPI;

        // Scale factor of image on canvas
        const widthRatio = displayWidth / (variant.printAreaWidth / canvasScale);
        const heightRatio = displayHeight / (variant.printAreaHeight / canvasScale);
        const coverRatio = Math.max(widthRatio, heightRatio);

        // Effective resolution when printed
        const effectiveDpi = Math.min(
          (imgWidth / coverRatio) / printWidthInches,
          (imgHeight / coverRatio) / printHeightInches
        ) * coverRatio;

        const dpi = Math.round(effectiveDpi);
        setCurrentDpi(dpi);
        onDpiChange?.(dpi);
        return dpi;
      },
      [variant, canvasScale, onDpiChange]
    );

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      addText: (text: string, style: TextStyle) => {
        if (!fabricCanvas) return;
        const textObj = new FabricText(text, {
          left: fabricCanvas.width! / 2,
          top: fabricCanvas.height! / 2,
          fontSize: style.fontSize,
          fill: style.color,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          underline: style.underline,
          originX: "center",
          originY: "center",
        });
        fabricCanvas.add(textObj);
        fabricCanvas.setActiveObject(textObj);
        fabricCanvas.renderAll();
        
        // Trigger selection change
        onSelectionChange?.(true, style);
      },

      updateSelectedTextStyle: (style: Partial<TextStyle>) => {
        if (!fabricCanvas) return;
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj || !(activeObj instanceof FabricText) || !activeObj.selectable) return;

        if (style.fontFamily !== undefined) activeObj.set("fontFamily", style.fontFamily);
        if (style.fontSize !== undefined) activeObj.set("fontSize", style.fontSize);
        if (style.color !== undefined) activeObj.set("fill", style.color);
        if (style.fontWeight !== undefined) activeObj.set("fontWeight", style.fontWeight);
        if (style.fontStyle !== undefined) activeObj.set("fontStyle", style.fontStyle);
        if (style.underline !== undefined) activeObj.set("underline", style.underline);

        fabricCanvas.renderAll();
      },

      getSelectedTextStyle: () => {
        if (!fabricCanvas) return null;
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj || !(activeObj instanceof FabricText) || !activeObj.selectable) return null;

        return {
          fontFamily: (activeObj.fontFamily as string) || "Inter, sans-serif",
          fontSize: (activeObj.fontSize as number) || 32,
          color: (activeObj.fill as string) || "#000000",
          fontWeight: activeObj.fontWeight === "bold" ? "bold" : "normal",
          fontStyle: activeObj.fontStyle === "italic" ? "italic" : "normal",
          underline: activeObj.underline || false,
        };
      },

      addClipart: async (clipart: ClipartItem) => {
        if (!fabricCanvas) return;

        try {
          const { objects } = await loadSVGFromString(clipart.svg);
          if (!objects || objects.length === 0) return;

          const group = util.groupSVGElements(objects);
          
          // Scale to a reasonable size (about 20% of canvas width)
          const targetSize = fabricCanvas.width! * 0.2;
          const scale = targetSize / Math.max(group.width || 100, group.height || 100);
          
          group.scale(scale);
          group.set({
            left: fabricCanvas.width! / 2,
            top: fabricCanvas.height! / 2,
            originX: "center",
            originY: "center",
            name: "clipart",
          });

          fabricCanvas.add(group);
          fabricCanvas.setActiveObject(group);
          fabricCanvas.renderAll();
        } catch (error) {
          console.error("Failed to add clipart:", error);
        }
      },

      addImage: async (file: File) => {
        if (!fabricCanvas) return;

        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const imgUrl = event.target?.result as string;
              const img = await FabricImage.fromURL(imgUrl);

              // Scale to cover canvas (like "Fit" in reference)
              const scaleX = fabricCanvas.width! / (img.width || 1);
              const scaleY = fabricCanvas.height! / (img.height || 1);
              const scale = Math.max(scaleX, scaleY);

              img.scale(scale);
              img.set({
                left: fabricCanvas.width! / 2,
                top: fabricCanvas.height! / 2,
                originX: "center",
                originY: "center",
                name: "user-image",
              });

              // Remove old user images
              fabricCanvas.getObjects().forEach((obj) => {
                if ((obj as any).name === "user-image") {
                  fabricCanvas.remove(obj);
                }
              });

              // Add below UI elements
              fabricCanvas.insertAt(0, img);
              fabricCanvas.setActiveObject(img);
              fabricCanvas.renderAll();

              // Calculate DPI
              calculateDpi(
                img.width || 0,
                img.height || 0,
                (img.width || 0) * scale,
                (img.height || 0) * scale
              );

              resolve();
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      },

      fitImage: () => {
        if (!fabricCanvas) return;
        const img = fabricCanvas.getObjects().find((obj) => (obj as any).name === "user-image");
        if (!img || !("width" in img)) return;

        const scaleX = fabricCanvas.width! / ((img as FabricImage).width || 1);
        const scaleY = fabricCanvas.height! / ((img as FabricImage).height || 1);
        const scale = Math.max(scaleX, scaleY);

        img.scale(scale);
        img.set({
          left: fabricCanvas.width! / 2,
          top: fabricCanvas.height! / 2,
          originX: "center",
          originY: "center",
        });
        fabricCanvas.renderAll();
      },

      rotateImage: (degrees: number) => {
        if (!fabricCanvas) return;
        const img = fabricCanvas.getObjects().find((obj) => (obj as any).name === "user-image");
        if (!img) return;

        img.rotate((img.angle || 0) + degrees);
        fabricCanvas.renderAll();
      },

      reset: () => {
        if (!fabricCanvas) return;
        fabricCanvas.getObjects().forEach((obj) => {
          if (obj.selectable) {
            fabricCanvas.remove(obj);
          }
        });
        setCurrentDpi(null);
        onDpiChange?.(null);
        fabricCanvas.renderAll();
      },

      exportForPrint: () => {
        if (!fabricCanvas) return "";

        // Export at full Printful resolution
        return fabricCanvas.toDataURL({
          format: "png",
          quality: 1,
          multiplier: canvasScale,
          enableRetinaScaling: false,
        });
      },

      getPreview: () => {
        if (!fabricCanvas) return "";
        return fabricCanvas.toDataURL({
          format: "png",
          quality: 0.9,
          multiplier: 1,
        });
      },

      hasImage: () => {
        if (!fabricCanvas) return false;
        return fabricCanvas.getObjects().some((obj) => (obj as any).name === "user-image");
      },

      hasSelectedText: () => {
        if (!fabricCanvas) return false;
        const activeObj = fabricCanvas.getActiveObject();
        return activeObj instanceof FabricText && activeObj.selectable === true;
      },

      setBackgroundFill: (fill: FillValue) => {
        if (!fabricCanvas) return;
        
        if (fill.type === "solid") {
          fabricCanvas.backgroundColor = fill.color;
        } else {
          // Create Fabric.js gradient
          const directionCoords: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
            "to-r": { x1: 0, y1: 0, x2: fabricCanvas.width!, y2: 0 },
            "to-b": { x1: 0, y1: 0, x2: 0, y2: fabricCanvas.height! },
            "to-br": { x1: 0, y1: 0, x2: fabricCanvas.width!, y2: fabricCanvas.height! },
            "to-tr": { x1: 0, y1: fabricCanvas.height!, x2: fabricCanvas.width!, y2: 0 },
          };
          const coords = directionCoords[fill.direction] || directionCoords["to-r"];
          
          const gradient = new Gradient({
            type: "linear",
            coords: coords,
            colorStops: [
              { offset: 0, color: fill.from },
              { offset: 1, color: fill.to },
            ],
          });
          fabricCanvas.backgroundColor = gradient;
        }
        fabricCanvas.renderAll();
      },

      getBackgroundFill: () => {
        if (!fabricCanvas) return { type: "solid" as const, color: "#f5f5f5" };
        const bg = fabricCanvas.backgroundColor;
        if (typeof bg === "string") {
          return { type: "solid" as const, color: bg || "#f5f5f5" };
        }
        // If it's a gradient, return the stored fill value
        return { type: "solid" as const, color: "#f5f5f5" };
      },
    }));

    return (
      <div className={cn("relative flex-1 flex flex-col", className)}>
        {/* DPI Indicator */}
        <div className="absolute top-4 left-4 z-10">
          <DpiIndicator dpi={currentDpi} />
        </div>

        {/* Safe Area label */}
        {currentDpi !== null && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <span className="text-xs text-accent/80 bg-card/80 px-2 py-1 rounded-full border border-accent/20">
              Safe Area
            </span>
          </div>
        )}

        {/* Canvas Container */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        >
          <div className="relative rounded-[2rem] shadow-strong bg-muted/50 p-2">
            <div className="rounded-[1.75rem] overflow-hidden">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
        </div>

        {/* Print info */}
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground">
          Back-only print
        </div>
      </div>
    );
  }
);

CaseCanvas.displayName = "CaseCanvas";
