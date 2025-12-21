import { useState, useCallback, useRef } from "react";
import { CaseCanvasRef } from "@/components/editor/CaseCanvas";
import { ToolType } from "@/components/editor/EditorToolbar";
import { toast } from "sonner";

export const useEditorState = () => {
  const canvasRef = useRef<CaseCanvasRef>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeColor, setActiveColor] = useState("#000000");
  const [currentDpi, setCurrentDpi] = useState<number | null>(null);
  const [hasImage, setHasImage] = useState(false);

  const handleToolChange = useCallback((tool: ToolType) => {
    if (tool === "text" && canvasRef.current) {
      canvasRef.current.addText("Your Text", activeColor);
      toast.success("Text added");
      setActiveTool("select");
    } else if (tool === "clipart") {
      // Placeholder - clipart feature coming soon
      toast.info("Clipart coming soon!");
      setActiveTool("select");
    } else if (tool === "fill") {
      // Placeholder - fill feature coming soon
      toast.info("Fill coming soon!");
      setActiveTool("select");
    } else {
      setActiveTool(tool);
    }
  }, [activeColor]);

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
    setActiveColor,
    handleToolChange,
    handleImageUpload,
    handleFitImage,
    handleRotateImage,
    handleReset,
    handleDpiChange,
    getPreviewData,
    getExportData,
  };
};
