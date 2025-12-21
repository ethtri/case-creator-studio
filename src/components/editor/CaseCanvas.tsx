import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Canvas as FabricCanvas, FabricImage, FabricText, Rect } from "fabric";
import { PhoneVariant } from "@/data/phoneVariants";
import { DpiIndicator, getDpiQuality } from "./DpiIndicator";
import { cn } from "@/lib/utils";

// Printful requires 300 DPI - we work at full resolution internally
const TARGET_DPI = 300;
const PRINT_INCH_RATIO = TARGET_DPI; // pixels per inch at 300 DPI

export interface CaseCanvasRef {
  addText: (text: string, color: string) => void;
  addImage: (file: File) => Promise<void>;
  fitImage: () => void;
  rotateImage: (degrees: number) => void;
  reset: () => void;
  exportForPrint: () => string;
  getPreview: () => string;
  hasImage: () => boolean;
}

interface CaseCanvasProps {
  variant: PhoneVariant;
  className?: string;
  onDpiChange?: (dpi: number | null) => void;
}

export const CaseCanvas = forwardRef<CaseCanvasRef, CaseCanvasProps>(
  ({ variant, className, onDpiChange }, ref) => {
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

      setFabricCanvas(canvas);

      return () => {
        canvas.dispose();
      };
    }, [variant, cameraHeight, cameraWidth, cameraPadding]);

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
      addText: (text: string, color: string) => {
        if (!fabricCanvas) return;
        const textObj = new FabricText(text, {
          left: fabricCanvas.width! / 2,
          top: fabricCanvas.height! / 2,
          fontSize: 32,
          fill: color,
          fontFamily: "Inter, sans-serif",
          originX: "center",
          originY: "center",
        });
        fabricCanvas.add(textObj);
        fabricCanvas.setActiveObject(textObj);
        fabricCanvas.renderAll();
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
