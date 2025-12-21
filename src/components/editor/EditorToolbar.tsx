import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Upload,
  Type,
  Smile,
  Paintbrush,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolType = "select" | "upload" | "text" | "layers" | "clipart" | "fill";

interface EditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  onImageUpload: (file: File) => void;
  onFitImage: () => void;
  onRotateImage: () => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isMobile: boolean;
  hasImage: boolean;
}

export const EditorToolbar = ({
  activeTool,
  onToolChange,
  onImageUpload,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isMobile,
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
            icon={Undo2}
            label="Undo"
            onClick={onUndo}
            isActive={false}
            disabled={!canUndo}
          />
          <ToolButton
            icon={Redo2}
            label="Redo"
            onClick={onRedo}
            isActive={false}
            disabled={!canRedo}
          />
          <ToolButton
            icon={Layers}
            label="Layers"
            onClick={() => onToolChange("layers")}
            isActive={activeTool === "layers"}
          />
          <ToolButton
            icon={Upload}
            label="File"
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
            icon={Smile}
            label="Clipart"
            onClick={() => onToolChange("clipart")}
            isActive={activeTool === "clipart"}
          />
          <ToolButton
            icon={Paintbrush}
            label="Fill"
            onClick={() => onToolChange("fill")}
            isActive={activeTool === "fill"}
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
        icon={Undo2}
        onClick={onUndo}
        isActive={false}
        tooltip="Undo"
        disabled={!canUndo}
      />
      <DesktopToolButton
        icon={Redo2}
        onClick={onRedo}
        isActive={false}
        tooltip="Redo"
        disabled={!canRedo}
      />
      <div className="w-8 h-px bg-border my-1" />
      <DesktopToolButton
        icon={Layers}
        onClick={() => onToolChange("layers")}
        isActive={activeTool === "layers"}
        tooltip="Layers"
      />
      <DesktopToolButton
        icon={Upload}
        onClick={triggerUpload}
        isActive={false}
        tooltip="File"
      />
      <DesktopToolButton
        icon={Type}
        onClick={() => onToolChange("text")}
        isActive={activeTool === "text"}
        tooltip="Text"
      />
      <DesktopToolButton
        icon={Smile}
        onClick={() => onToolChange("clipart")}
        isActive={activeTool === "clipart"}
        tooltip="Clipart"
      />
      <DesktopToolButton
        icon={Paintbrush}
        onClick={() => onToolChange("fill")}
        isActive={activeTool === "fill"}
        tooltip="Fill"
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
  disabled?: boolean;
}

const DesktopToolButton = ({
  icon: Icon,
  onClick,
  isActive,
  tooltip,
  disabled,
}: DesktopToolButtonProps) => (
  <Button
    variant={isActive ? "tool-active" : "ghost"}
    size="icon"
    onClick={onClick}
    title={tooltip}
    disabled={disabled}
    className={cn(
      "w-10 h-10",
      !isActive && !disabled && "text-muted-foreground hover:text-foreground",
      disabled && "opacity-40"
    )}
  >
    <Icon className="w-5 h-5" />
  </Button>
);
