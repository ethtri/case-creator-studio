import { useState, useCallback, useRef } from "react";
import { CaseCanvasRef } from "@/components/editor/CaseCanvas";
import { ToolType } from "@/components/editor/EditorToolbar";
import { FillValue } from "@/components/editor/FillColorPicker";
import { ClipartItem } from "@/data/clipartData";
import { toast } from "sonner";

export const useEditorState = () => {
  const canvasRef = useRef<CaseCanvasRef>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeColor, setActiveColor] = useState("#000000");
  const [currentDpi, setCurrentDpi] = useState<number | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [backgroundFill, setBackgroundFill] = useState<FillValue>({ type: "solid", color: "#f5f5f5" });

  const handleToolChange = useCallback((tool: ToolType) => {
    if (tool === "text" && canvasRef.current) {
      canvasRef.current.addText("Your Text", activeColor);
      toast.success("Text added");
      setActiveTool("select");
    } else if (tool === "clipart") {
      // Toggle clipart panel
      setActiveTool(activeTool === "clipart" ? "select" : "clipart");
    } else if (tool === "fill") {
      // Toggle fill panel
      setActiveTool(activeTool === "fill" ? "select" : "fill");
    } else if (tool === "layers") {
      // Toggle layers panel
      setActiveTool(activeTool === "layers" ? "select" : "layers");
    } else {
      setActiveTool(tool);
    }
  }, [activeColor, activeTool]);

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
    const defaultFill: FillValue = { type: "solid", color: "#f5f5f5" };
    setBackgroundFill(defaultFill);
    canvasRef.current?.setBackgroundFill(defaultFill);
    toast.success("Canvas cleared");
  }, []);

  const handleDpiChange = useCallback((dpi: number | null) => {
    setCurrentDpi(dpi);
  }, []);

  const getPreviewData = useCallback(() => {
    return canvasRef.current?.getPreview() || "";
  }, []);

  const getExportData = useCallback(() => {
    return canvasRef.current?.exportForPrint() || "";
  }, []);

  return {
    canvasRef,
    activeTool,
    activeColor,
    currentDpi,
    hasImage,
    backgroundFill,
    setActiveColor,
    handleToolChange,
    handleAddClipart,
    handleImageUpload,
    handleFitImage,
    handleRotateImage,
    handleReset,
    handleDpiChange,
    handleBackgroundFillChange,
    getPreviewData,
    getExportData,
  };
};
