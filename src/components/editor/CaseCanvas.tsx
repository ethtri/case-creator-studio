import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Canvas as FabricCanvas, FabricImage, FabricText, Rect, Gradient, loadSVGFromString, util, FabricObject, Circle } from "fabric";
import { PhoneVariant, CameraConfig, LensConfig } from "@/data/phoneVariants";
import { cn } from "@/lib/utils";
import { FillValue } from "./FillColorPicker";
import { ClipartItem } from "@/data/clipartData";
import { TextStyle } from "./TextStyler";
import { Layer } from "./LayersPanel";
import { useTouchGestures } from "@/hooks/useTouchGestures";

// Printful requires 300 DPI - we work at full resolution internally
const TARGET_DPI = 300;
const MAX_HISTORY = 50;

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
  getDesignState: () => string;
  loadDesignState: (stateJson: string) => Promise<void>;
  hasImage: () => boolean;
  hasSelectedText: () => boolean;
  setBackgroundFill: (fill: FillValue) => void;
  getBackgroundFill: () => FillValue;
  // Layer management
  getLayers: () => Layer[];
  toggleLayerVisibility: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  selectLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  // History management
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

interface CaseCanvasProps {
  variant: PhoneVariant;
  className?: string;
  onDpiChange?: (dpi: number | null) => void;
  onSelectionChange?: (hasText: boolean, style: TextStyle | null) => void;
  onLayersChange?: (layers: Layer[]) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

// Create camera cutout overlay using Fabric.js objects
const createCameraOverlay = (
  canvas: FabricCanvas,
  camera: CameraConfig,
  canvasWidth: number,
  canvasHeight: number
) => {
  const objects: FabricObject[] = [];

  if (camera.shape === "scattered") {
    // Samsung-style: individual lenses positioned absolutely
    camera.lenses.forEach((lens) => {
      if (lens.absoluteX !== undefined && lens.absoluteY !== undefined && lens.absoluteSize !== undefined) {
        const cx = (lens.absoluteX / 100) * canvasWidth;
        const cy = (lens.absoluteY / 100) * canvasHeight;
        const radius = (lens.absoluteSize / 100) * canvasWidth / 2;

        // Outer ring (dark)
        const outerRing = new Circle({
          left: cx,
          top: cy,
          radius: radius + 3,
          fill: "#1a1a1a",
          stroke: "#333",
          strokeWidth: 1,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          name: "camera-overlay",
        });

        // Inner lens (darker with glass effect)
        const innerLens = new Circle({
          left: cx,
          top: cy,
          radius: radius,
          fill: lens.type === "lens" ? "#0a0a0a" : lens.type === "flash" ? "#2a2a2a" : "#1a1a1a",
          stroke: lens.type === "lens" ? "#444" : "#333",
          strokeWidth: 1,
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          name: "camera-overlay",
        });

        // Lens reflection (subtle highlight)
        if (lens.type === "lens") {
          const reflection = new Circle({
            left: cx - radius * 0.2,
            top: cy - radius * 0.2,
            radius: radius * 0.3,
            fill: "rgba(255, 255, 255, 0.08)",
            selectable: false,
            evented: false,
            name: "camera-overlay",
          });
          objects.push(outerRing, innerLens, reflection);
        } else {
          objects.push(outerRing, innerLens);
        }
      }
    });
  } else {
    // iPhone-style: camera module background with lenses inside
    const offsetX = (camera.offsetPercent / 100) * canvasWidth;
    const offsetY = (camera.offsetPercent / 100) * canvasHeight;
    const moduleWidth = (camera.widthPercent / 100) * canvasWidth;
    const moduleHeight = (camera.heightPercent / 100) * canvasHeight;

    // Camera module background
    const moduleCornerRadius = camera.shape === "square" ? moduleWidth * 0.22 : Math.min(moduleWidth, moduleHeight) * 0.45;
    
    const moduleBackground = new Rect({
      left: offsetX,
      top: offsetY,
      width: moduleWidth,
      height: moduleHeight,
      fill: "#1a1a1a",
      stroke: "#333",
      strokeWidth: 2,
      rx: moduleCornerRadius,
      ry: moduleCornerRadius,
      selectable: false,
      evented: false,
      name: "camera-overlay",
    });
    objects.push(moduleBackground);

    // Add individual lenses
    camera.lenses.forEach((lens) => {
      const cx = offsetX + (lens.x / 100) * moduleWidth;
      const cy = offsetY + (lens.y / 100) * moduleHeight;
      const radius = (lens.size / 100) * moduleWidth / 2;

      // Outer ring
      const outerRing = new Circle({
        left: cx,
        top: cy,
        radius: radius + 2,
        fill: "#0d0d0d",
        stroke: "#2a2a2a",
        strokeWidth: 1,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        name: "camera-overlay",
      });

      // Inner lens
      const innerLens = new Circle({
        left: cx,
        top: cy,
        radius: radius * 0.85,
        fill: lens.type === "lens" ? "#050505" : lens.type === "flash" ? "#3a3a3a" : "#1a1a1a",
        stroke: lens.type === "lens" ? "#333" : "#444",
        strokeWidth: 1,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        name: "camera-overlay",
      });

      objects.push(outerRing, innerLens);

      // Add reflection for main lenses
      if (lens.type === "lens" && radius > 5) {
        const reflection = new Circle({
          left: cx - radius * 0.25,
          top: cy - radius * 0.25,
          radius: radius * 0.25,
          fill: "rgba(255, 255, 255, 0.06)",
          selectable: false,
          evented: false,
          name: "camera-overlay",
        });
        objects.push(reflection);
      }
    });
  }

  return objects;
};

export const CaseCanvas = forwardRef<CaseCanvasRef, CaseCanvasProps>(
  ({ variant, className, onDpiChange, onSelectionChange, onLayersChange, onHistoryChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
    const [currentDpi, setCurrentDpi] = useState<number | null>(null);
    const [canvasScale, setCanvasScale] = useState(1);
    const layerIdCounter = useRef(0);
    const pendingStateRef = useRef<string | null>(null);
    
    // History state
    const historyRef = useRef<string[]>([]);
    const currentIndexRef = useRef(-1);
    const isRestoringRef = useRef(false);

    // Enable touch gestures for pinch-to-zoom and rotate
    useTouchGestures(fabricCanvas);

    // Helper to generate unique layer IDs
    const generateLayerId = () => {
      layerIdCounter.current += 1;
      return `layer-${layerIdCounter.current}`;
    };

    const updateLayerIdCounter = useCallback((objects: FabricObject[]) => {
      let maxId = layerIdCounter.current;
      objects.forEach((obj) => {
        const layerId = (obj as any).layerId as string | undefined;
        if (!layerId) return;
        const match = /layer-(\d+)/.exec(layerId);
        if (match) {
          const value = Number(match[1]);
          if (!Number.isNaN(value)) {
            maxId = Math.max(maxId, value);
          }
        }
      });
      layerIdCounter.current = maxId;
    }, []);

    // Helper to get layer info from fabric object
    const getLayerFromObject = (obj: FabricObject): Layer | null => {
      const name = (obj as any).name as string | undefined;
      const layerId = (obj as any).layerId as string | undefined;
      
      if (!layerId || !obj.selectable) return null;

      let type: Layer["type"] = "clipart";
      let displayName = "Element";

      if (name === "user-image") {
        type = "image";
        displayName = "Image";
      } else if (obj instanceof FabricText) {
        type = "text";
        displayName = (obj.text as string)?.slice(0, 20) || "Text";
      } else if (name === "clipart") {
        type = "clipart";
        displayName = "Sticker";
      }

      return {
        id: layerId,
        name: displayName,
        type,
        visible: obj.visible !== false,
        locked: !obj.selectable,
        selected: obj === fabricCanvas?.getActiveObject(),
      };
    };

    // Notify parent of layer changes
    const notifyLayersChange = useCallback(() => {
      if (!fabricCanvas) return;
      const layers: Layer[] = [];
      fabricCanvas.getObjects().forEach((obj) => {
        const layer = getLayerFromObject(obj);
        if (layer) layers.push(layer);
      });
      onLayersChange?.(layers);
    }, [fabricCanvas, onLayersChange]);

    // Notify parent of history state changes
    const notifyHistoryChange = useCallback(() => {
      const canUndo = currentIndexRef.current > 0;
      const canRedo = currentIndexRef.current < historyRef.current.length - 1;
      onHistoryChange?.(canUndo, canRedo);
    }, [onHistoryChange]);

    const serializeBackgroundColor = useCallback((background: FabricCanvas["backgroundColor"]) => {
      if (typeof background === "string") return background;
      if (background && typeof background === "object" && "toObject" in background) {
        return (background as Gradient).toObject();
      }
      return background || "#f5f5f5";
    }, []);

    // Save current state to history
    const saveToHistory = useCallback((canvas: FabricCanvas) => {
      if (isRestoringRef.current) return;
      
      // Get only user objects (exclude safe-area and camera-overlay)
      const objects = canvas.getObjects().filter(obj => {
        const name = (obj as any).name;
        return name !== "safe-area" && name !== "camera-overlay";
      });
      
      const state = JSON.stringify({
        objects: objects.map(obj => obj.toObject(["name", "layerId"])),
        backgroundColor: serializeBackgroundColor(canvas.backgroundColor),
      });

      // Remove any redo states
      if (currentIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, currentIndexRef.current + 1);
      }

      // Add new state
      historyRef.current.push(state);
      
      // Limit history size
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.shift();
      } else {
        currentIndexRef.current++;
      }

      notifyHistoryChange();
    }, [notifyHistoryChange, serializeBackgroundColor]);

    const buildStateJson = useCallback((canvas: FabricCanvas) => {
      const objects = canvas.getObjects().filter(obj => {
        const name = (obj as any).name;
        return name !== "safe-area" && name !== "camera-overlay";
      });

      return JSON.stringify({
        objects: objects.map(obj => obj.toObject(["name", "layerId"])),
        backgroundColor: serializeBackgroundColor(canvas.backgroundColor),
      });
    }, [serializeBackgroundColor]);

    const restoreCanvasState = useCallback(async (canvas: FabricCanvas, stateJson: string, resetHistory: boolean) => {
      isRestoringRef.current = true;

      try {
        const state = JSON.parse(stateJson);

        canvas.getObjects().forEach(obj => {
          const name = (obj as any).name;
          if (name !== "safe-area" && name !== "camera-overlay") {
            canvas.remove(obj);
          }
        });

        const objects = state.objects || [];
        if (objects.length > 0) {
          const enlivened = await util.enlivenObjects<FabricObject>(objects);
          const uiObjectIndex = canvas.getObjects().findIndex(obj => {
            const name = (obj as any).name;
            return name === "camera-overlay" || name === "safe-area";
          });
          const insertionIndex = uiObjectIndex >= 0 ? uiObjectIndex : canvas.getObjects().length;
          canvas.insertAt(insertionIndex, ...enlivened);
        }

        const backgroundColor = state.backgroundColor;
        if (backgroundColor && typeof backgroundColor === "object" && "type" in backgroundColor) {
          canvas.backgroundColor = await Gradient.fromObject(backgroundColor);
        } else {
          canvas.backgroundColor = backgroundColor || "#f5f5f5";
        }
        canvas.renderAll();
        updateLayerIdCounter(canvas.getObjects());
        notifyLayersChange();

        if (resetHistory) {
          historyRef.current = [stateJson];
          currentIndexRef.current = 0;
          notifyHistoryChange();
        }
      } catch (error) {
        console.error("Failed to restore design state:", error);
      } finally {
        isRestoringRef.current = false;
      }
    }, [notifyHistoryChange, notifyLayersChange, updateLayerIdCounter]);

    // Restore state from history
    const restoreFromHistory = useCallback(async (canvas: FabricCanvas, stateJson: string) => {
      await restoreCanvasState(canvas, stateJson, false);
    }, [restoreCanvasState]);

    // Initialize canvas with programmatic rendering
    useEffect(() => {
      if (!canvasRef.current || !containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      // Calculate display dimensions based on container and aspect ratio
      const aspectRatio = variant.printAreaWidth / variant.printAreaHeight;
      const maxHeight = Math.min(containerRect.height - 80, 550);
      const maxWidth = containerRect.width - 48;
      
      let displayHeight = maxHeight;
      let displayWidth = displayHeight * aspectRatio;
      
      if (displayWidth > maxWidth) {
        displayWidth = maxWidth;
        displayHeight = displayWidth / aspectRatio;
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

      // Add camera cutout overlay (will be on top)
      const cameraObjects = createCameraOverlay(canvas, variant.camera, displayWidth, displayHeight);
      cameraObjects.forEach(obj => canvas.add(obj));

      // Add safe area border (dashed pink outline)
      const safeAreaPadding = 12;
      const safeArea = new Rect({
        left: safeAreaPadding,
        top: safeAreaPadding,
        width: displayWidth - safeAreaPadding * 2,
        height: displayHeight - safeAreaPadding * 2,
        fill: "transparent",
        stroke: "hsl(330, 75%, 60%)",
        strokeWidth: 2,
        strokeDashArray: [8, 4],
        rx: 12,
        ry: 12,
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

      // Reset history for a fresh canvas, then seed the initial empty state
      historyRef.current = [];
      currentIndexRef.current = -1;
      notifyHistoryChange();
      saveToHistory(canvas);

      return () => {
        canvas.off("selection:created", handleSelection);
        canvas.off("selection:updated", handleSelection);
        canvas.off("selection:cleared");
        canvas.dispose();
      };
    }, [variant, onSelectionChange, notifyHistoryChange, saveToHistory]);

    useEffect(() => {
      if (!fabricCanvas || !pendingStateRef.current) return;
      const pendingState = pendingStateRef.current;
      pendingStateRef.current = null;
      restoreCanvasState(fabricCanvas, pendingState, true);
    }, [fabricCanvas, restoreCanvasState]);

    // Track object modifications for history
    useEffect(() => {
      if (!fabricCanvas) return;

      const handleModified = () => {
        if (!isRestoringRef.current) {
          saveToHistory(fabricCanvas);
        }
      };

      fabricCanvas.on("object:modified", handleModified);
      
      return () => {
        fabricCanvas.off("object:modified", handleModified);
      };
    }, [fabricCanvas, saveToHistory]);

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
        const layerId = generateLayerId();
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
        (textObj as any).layerId = layerId;
        
        // Insert below UI elements
        const uiObjectIndex = fabricCanvas.getObjects().findIndex(obj => {
          const name = (obj as any).name;
          return name === "camera-overlay" || name === "safe-area";
        });
        
        if (uiObjectIndex > 0) {
          fabricCanvas.insertAt(uiObjectIndex, textObj);
        } else {
          fabricCanvas.add(textObj);
        }
        
        fabricCanvas.setActiveObject(textObj);
        fabricCanvas.renderAll();
        
        // Trigger selection change and notify layers
        onSelectionChange?.(true, style);
        notifyLayersChange();
        saveToHistory(fabricCanvas);
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
        saveToHistory(fabricCanvas);
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
          const layerId = generateLayerId();
          
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
          (group as any).layerId = layerId;

          // Insert below UI elements
          const uiObjectIndex = fabricCanvas.getObjects().findIndex(obj => {
            const name = (obj as any).name;
            return name === "camera-overlay" || name === "safe-area";
          });
          
          if (uiObjectIndex > 0) {
            fabricCanvas.insertAt(uiObjectIndex, group);
          } else {
            fabricCanvas.add(group);
          }
          
          fabricCanvas.setActiveObject(group);
          fabricCanvas.renderAll();
          notifyLayersChange();
          saveToHistory(fabricCanvas);
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
              const layerId = generateLayerId();

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
              (img as any).layerId = layerId;

              // Remove old user images
              fabricCanvas.getObjects().forEach((obj) => {
                if ((obj as any).name === "user-image") {
                  fabricCanvas.remove(obj);
                }
              });

              // Add at index 0 (bottom)
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

              notifyLayersChange();
              saveToHistory(fabricCanvas);
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
        saveToHistory(fabricCanvas);
      },

      rotateImage: (degrees: number) => {
        if (!fabricCanvas) return;
        const img = fabricCanvas.getObjects().find((obj) => (obj as any).name === "user-image");
        if (!img) return;

        img.rotate((img.angle || 0) + degrees);
        fabricCanvas.renderAll();
        saveToHistory(fabricCanvas);
      },

      reset: () => {
        if (!fabricCanvas) return;
        fabricCanvas.getObjects().forEach((obj) => {
          const name = (obj as any).name;
          if (obj.selectable && name !== "camera-overlay" && name !== "safe-area") {
            fabricCanvas.remove(obj);
          }
        });
        setCurrentDpi(null);
        onDpiChange?.(null);
        fabricCanvas.renderAll();
        // Clear history on reset
        historyRef.current = [];
        currentIndexRef.current = -1;
        notifyHistoryChange();
      },

      exportForPrint: () => {
        if (!fabricCanvas) return "";

        // Temporarily hide camera overlay for export
        const cameraObjects = fabricCanvas.getObjects().filter(obj => (obj as any).name === "camera-overlay");
        const safeAreaObjects = fabricCanvas.getObjects().filter(obj => (obj as any).name === "safe-area");
        
        cameraObjects.forEach(obj => obj.set("visible", false));
        safeAreaObjects.forEach(obj => obj.set("visible", false));
        
        // Export at full Printful resolution
        const dataUrl = fabricCanvas.toDataURL({
          format: "png",
          quality: 1,
          multiplier: canvasScale,
          enableRetinaScaling: false,
        });
        
        // Restore visibility
        cameraObjects.forEach(obj => obj.set("visible", true));
        safeAreaObjects.forEach(obj => obj.set("visible", true));
        fabricCanvas.renderAll();
        
        return dataUrl;
      },

      getPreview: () => {
        if (!fabricCanvas) return "";
        
        // Temporarily hide safe area for preview (keep camera visible)
        const safeAreaObjects = fabricCanvas.getObjects().filter(obj => (obj as any).name === "safe-area");
        safeAreaObjects.forEach(obj => obj.set("visible", false));
        
        const dataUrl = fabricCanvas.toDataURL({
          format: "png",
          quality: 0.9,
          multiplier: 1,
        });
        
        safeAreaObjects.forEach(obj => obj.set("visible", true));
        fabricCanvas.renderAll();
        
        return dataUrl;
      },

      getDesignState: () => {
        if (!fabricCanvas) return "";
        return buildStateJson(fabricCanvas);
      },

      loadDesignState: async (stateJson: string) => {
        if (!fabricCanvas) {
          pendingStateRef.current = stateJson;
          return;
        }
        pendingStateRef.current = null;
        await restoreCanvasState(fabricCanvas, stateJson, true);
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
        saveToHistory(fabricCanvas);
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

      // Layer management methods
      getLayers: () => {
        if (!fabricCanvas) return [];
        const layers: Layer[] = [];
        fabricCanvas.getObjects().forEach((obj) => {
          const layer = getLayerFromObject(obj);
          if (layer) layers.push(layer);
        });
        return layers;
      },

      toggleLayerVisibility: (id: string) => {
        if (!fabricCanvas) return;
        const obj = fabricCanvas.getObjects().find((o) => (o as any).layerId === id);
        if (!obj) return;
        obj.set("visible", !obj.visible);
        fabricCanvas.renderAll();
        notifyLayersChange();
        saveToHistory(fabricCanvas);
      },

      moveLayerUp: (id: string) => {
        if (!fabricCanvas) return;
        const objects = fabricCanvas.getObjects();
        const objIndex = objects.findIndex((o) => (o as any).layerId === id);
        if (objIndex === -1) return;
        
        // Find next selectable layer above (excluding UI elements)
        for (let i = objIndex + 1; i < objects.length; i++) {
          const name = (objects[i] as any).name;
          if (objects[i].selectable && name !== "camera-overlay" && name !== "safe-area") {
            // Swap positions by removing and re-adding
            const obj = objects[objIndex];
            fabricCanvas.remove(obj);
            fabricCanvas.insertAt(i, obj);
            break;
          }
        }
        fabricCanvas.renderAll();
        notifyLayersChange();
        saveToHistory(fabricCanvas);
      },

      moveLayerDown: (id: string) => {
        if (!fabricCanvas) return;
        const objects = fabricCanvas.getObjects();
        const objIndex = objects.findIndex((o) => (o as any).layerId === id);
        if (objIndex === -1) return;
        
        // Find next selectable layer below
        for (let i = objIndex - 1; i >= 0; i--) {
          if (objects[i].selectable) {
            // Swap positions
            const obj = objects[objIndex];
            fabricCanvas.remove(obj);
            fabricCanvas.insertAt(i, obj);
            break;
          }
        }
        fabricCanvas.renderAll();
        notifyLayersChange();
        saveToHistory(fabricCanvas);
      },

      selectLayer: (id: string) => {
        if (!fabricCanvas) return;
        const obj = fabricCanvas.getObjects().find((o) => (o as any).layerId === id);
        if (!obj || !obj.selectable) return;
        fabricCanvas.setActiveObject(obj);
        fabricCanvas.renderAll();
        notifyLayersChange();
      },

      deleteLayer: (id: string) => {
        if (!fabricCanvas) return;
        const obj = fabricCanvas.getObjects().find((o) => (o as any).layerId === id);
        if (!obj || !obj.selectable) return;
        fabricCanvas.remove(obj);
        fabricCanvas.renderAll();
        notifyLayersChange();
        saveToHistory(fabricCanvas);
      },

      // History management
      undo: async () => {
        if (!fabricCanvas || currentIndexRef.current <= 0) return;
        currentIndexRef.current--;
        const state = historyRef.current[currentIndexRef.current];
        await restoreFromHistory(fabricCanvas, state);
        notifyHistoryChange();
      },

      redo: async () => {
        if (!fabricCanvas || currentIndexRef.current >= historyRef.current.length - 1) return;
        currentIndexRef.current++;
        const state = historyRef.current[currentIndexRef.current];
        await restoreFromHistory(fabricCanvas, state);
        notifyHistoryChange();
      },

      canUndo: () => currentIndexRef.current > 0,
      canRedo: () => currentIndexRef.current < historyRef.current.length - 1,
    }));

    // Calculate print dimensions in inches for display
    const printWidthInches = (variant.printAreaWidth / TARGET_DPI).toFixed(2);
    const printHeightInches = (variant.printAreaHeight / TARGET_DPI).toFixed(2);

    return (
      <div className={cn("relative flex-1 flex flex-col min-h-0", className)}>
        {/* Model name header */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-background/90 backdrop-blur-sm rounded-full border border-border/50 shadow-sm">
          <span className="text-xs font-medium text-foreground">
            {variant.brand} {variant.model}
          </span>
        </div>

        {/* Canvas Container */}
        <div
          key={variant.id}
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-4 pt-10 pb-8 overflow-hidden"
        >
          {/* Phone case frame */}
          <div className="relative">
            {/* Ambient shadow */}
            <div 
              className="absolute inset-0 rounded-[2rem] bg-gradient-to-b from-black/8 to-black/25 blur-2xl translate-y-4 scale-[0.92]"
              aria-hidden="true"
            />
            
            {/* Case shell */}
            <div 
              className="relative bg-background border-2 border-border/60 rounded-[1.75rem] overflow-hidden shadow-xl"
              style={{
                boxShadow: "0 8px 32px -8px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              {/* Canvas */}
              <canvas ref={canvasRef} className="block touch-none" />
              
              {/* Corner radius overlay to simulate case edges */}
              <div 
                className="absolute inset-0 pointer-events-none rounded-[1.5rem]"
                style={{
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1), inset 0 2px 4px rgba(0,0,0,0.05)",
                }}
              />
            </div>
            
            {/* Right edge highlight */}
            <div 
              className="absolute top-6 bottom-6 -right-0.5 w-[2px] rounded-full bg-gradient-to-b from-white/30 via-white/15 to-white/30"
              aria-hidden="true"
            />
            
            {/* Left edge shadow */}
            <div 
              className="absolute top-6 bottom-6 -left-0.5 w-[1.5px] rounded-full bg-gradient-to-b from-black/10 via-black/5 to-black/10"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Print info - hidden on mobile */}
        <div className="absolute bottom-4 left-4 text-xs text-muted-foreground hidden md:flex items-center gap-3">
          <span>Back-only print</span>
          <span className="text-border">•</span>
          <span>{printWidthInches}" × {printHeightInches}" @ 300 DPI</span>
        </div>
      </div>
    );
  }
);

CaseCanvas.displayName = "CaseCanvas";
