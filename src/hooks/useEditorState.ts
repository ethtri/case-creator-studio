import { useState, useCallback, useRef } from "react";
import { CaseCanvasRef } from "@/components/editor/CaseCanvas";
import { ToolType } from "@/components/editor/EditorToolbar";
import { FillValue } from "@/components/editor/FillColorPicker";
import { TextStyle, defaultTextStyle } from "@/components/editor/TextStyler";
import { Layer } from "@/components/editor/LayersPanel";
import { ClipartItem } from "@/data/clipartData";
import { toast } from "sonner";

export const useEditorState = () => {
  const canvasRef = useRef<CaseCanvasRef>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [currentDpi, setCurrentDpi] = useState<number | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [backgroundFill, setBackgroundFill] = useState<FillValue>({ type: "solid", color: "#f5f5f5" });
  const [textStyle, setTextStyle] = useState<TextStyle>(defaultTextStyle);
  const [hasSelectedText, setHasSelectedText] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const handleToolChange = useCallback((tool: ToolType) => {
    if (tool === "text") {
      // Toggle text panel - clicking adds text and opens styling
      if (activeTool !== "text") {
        if (canvasRef.current) {
          canvasRef.current.addText("Your Text", textStyle);
          toast.success("Text added - customize it in the panel");
        }
        setActiveTool("text");
      } else {
        setActiveTool("select");
      }
    } else if (tool === "clipart") {
      setActiveTool(activeTool === "clipart" ? "select" : "clipart");
    } else if (tool === "fill") {
      setActiveTool(activeTool === "fill" ? "select" : "fill");
    } else if (tool === "layers") {
      setActiveTool(activeTool === "layers" ? "select" : "layers");
    } else {
      setActiveTool(tool);
    }
  }, [activeTool, textStyle]);

  const handleSelectionChange = useCallback((hasText: boolean, style: TextStyle | null) => {
    setHasSelectedText(hasText);
    if (style) {
      setTextStyle(style);
      // Auto-open text panel when text is selected
      if (hasText) {
        setActiveTool("text");
      }
    }
  }, []);

  const handleTextStyleChange = useCallback((style: Partial<TextStyle>) => {
    setTextStyle((prev) => ({ ...prev, ...style }));
    canvasRef.current?.updateSelectedTextStyle(style);
  }, []);

  const handleLayersChange = useCallback((newLayers: Layer[]) => {
    setLayers(newLayers);
  }, []);

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);

  const handleToggleLayerVisibility = useCallback((id: string) => {
    canvasRef.current?.toggleLayerVisibility(id);
  }, []);

  const handleMoveLayerUp = useCallback((id: string) => {
    canvasRef.current?.moveLayerUp(id);
  }, []);

  const handleMoveLayerDown = useCallback((id: string) => {
    canvasRef.current?.moveLayerDown(id);
  }, []);

  const handleSelectLayer = useCallback((id: string) => {
    canvasRef.current?.selectLayer(id);
  }, []);

  const handleDeleteLayer = useCallback((id: string) => {
    canvasRef.current?.deleteLayer(id);
    toast.success("Layer deleted");
  }, []);

  const handleAddClipart = useCallback(async (clipart: ClipartItem) => {
    if (!canvasRef.current) return;
    
    try {
      await canvasRef.current.addClipart(clipart);
      toast.success(`${clipart.name} added`);
      setActiveTool("select");
    } catch {
      toast.error("Failed to add clipart");
    }
  }, []);

  const handleBackgroundFillChange = useCallback((fill: FillValue) => {
    setBackgroundFill(fill);
    canvasRef.current?.setBackgroundFill(fill);
  }, []);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!canvasRef.current) return;
    
    try {
      await canvasRef.current.addImage(file);
      setHasImage(true);
      toast.success("Image added");
    } catch {
      toast.error("Failed to load image");
    }
  }, []);

  const handleFitImage = useCallback(() => {
    canvasRef.current?.fitImage();
  }, []);

  const handleRotateImage = useCallback(() => {
    canvasRef.current?.rotateImage(90);
  }, []);

  const handleReset = useCallback(() => {
    canvasRef.current?.reset();
    setHasImage(false);
    setCurrentDpi(null);
    setHasSelectedText(false);
    setLayers([]);
    const defaultFill: FillValue = { type: "solid", color: "#f5f5f5" };
    setBackgroundFill(defaultFill);
    canvasRef.current?.setBackgroundFill(defaultFill);
    setTextStyle(defaultTextStyle);
    toast.success("Canvas cleared");
  }, []);

  const handleDpiChange = useCallback((dpi: number | null) => {
    setCurrentDpi(dpi);
  }, []);

  const handleUndo = useCallback(() => {
    canvasRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    canvasRef.current?.redo();
  }, []);

  const getPreviewData = useCallback(() => {
    return canvasRef.current?.getPreview() || "";
  }, []);

  const getDesignState = useCallback(() => {
    return canvasRef.current?.getDesignState() || "";
  }, []);

  const getExportData = useCallback(() => {
    return canvasRef.current?.exportForPrint() || "";
  }, []);

  return {
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
    getDesignState,
    getExportData,
  };
};

