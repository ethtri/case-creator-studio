import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  ImagePlus,
  Type,
  Layers,
  Upload,
  Maximize,
  RotateCw,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolType = "select" | "upload" | "text" | "layers";

interface EditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onImageUpload: (file: File) => void;
  onFitImage: () => void;
  onRotateImage: () => void;
  onReset: () => void;
  isMobile: boolean;
  hasImage: boolean;
}

export const EditorToolbar = ({
  activeTool,
  onToolChange,
  onImageUpload,
  onFitImage,
  onRotateImage,
  onReset,
  isMobile,
  hasImage,
}: EditorToolbarProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  // Mobile bottom toolbar
  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 pb-safe z-50">
        <div className="flex items-center justify-around py-3">
          <ToolButton
            icon={Upload}
            label="Upload"
            onClick={triggerUpload}
            isActive={false}
          />
          <ToolButton
            icon={Type}
            label="Text"
            onClick={() => onToolChange("text")}
            isActive={activeTool === "text"}
          />
          <ToolButton
            icon={Maximize}
            label="Fit"
            onClick={onFitImage}
            isActive={false}
            disabled={!hasImage}
          />
          <ToolButton
            icon={RotateCw}
            label="Rotate"
            onClick={onRotateImage}
            isActive={false}
            disabled={!hasImage}
          />
          <ToolButton
            icon={Undo2}
            label="Reset"
            onClick={onReset}
            isActive={false}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  // Desktop sidebar
  return (
    <aside className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-2">
      <DesktopToolButton
        icon={ImagePlus}
        onClick={triggerUpload}
        isActive={false}
        tooltip="Upload Image"
      />
      <DesktopToolButton
        icon={Type}
        onClick={() => onToolChange("text")}
        isActive={activeTool === "text"}
        tooltip="Add Text"
      />
      <DesktopToolButton
        icon={Layers}
        onClick={() => onToolChange("layers")}
        isActive={activeTool === "layers"}
        tooltip="Layers"
      />
      <div className="h-px w-8 bg-border my-2" />
      <DesktopToolButton
        icon={Upload}
        onClick={triggerUpload}
        isActive={false}
        tooltip="Upload"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </aside>
  );
};

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isActive: boolean;
  disabled?: boolean;
}

const ToolButton = ({
  icon: Icon,
  label,
  onClick,
  isActive,
  disabled,
}: ToolButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
      isActive
        ? "text-cta"
        : disabled
        ? "text-muted-foreground/50"
        : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Icon className="w-5 h-5" />
    <span className="text-xs">{label}</span>
  </button>
);

interface DesktopToolButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  isActive: boolean;
  tooltip: string;
}

const DesktopToolButton = ({
  icon: Icon,
  onClick,
  isActive,
  tooltip,
}: DesktopToolButtonProps) => (
  <Button
    variant={isActive ? "tool-active" : "ghost"}
    size="icon"
    onClick={onClick}
    title={tooltip}
    className={cn(
      "w-10 h-10",
      !isActive && "text-muted-foreground hover:text-foreground"
    )}
  >
    <Icon className="w-5 h-5" />
  </Button>
);
