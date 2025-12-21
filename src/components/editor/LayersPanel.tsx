import { useState } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Trash2,
  Image,
  Type,
  Smile,
  Lock,
} from "lucide-react";

export interface Layer {
  id: string;
  name: string;
  type: "image" | "text" | "clipart" | "system";
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

interface LayersPanelProps {
  layers: Layer[];
  onToggleVisibility: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

const getLayerIcon = (type: Layer["type"]) => {
  switch (type) {
    case "image":
      return Image;
    case "text":
      return Type;
    case "clipart":
      return Smile;
    default:
      return Lock;
  }
};

export const LayersPanel = ({
  layers,
  onToggleVisibility,
  onMoveUp,
  onMoveDown,
  onSelect,
  onDelete,
  className,
}: LayersPanelProps) => {
  // Filter out system layers for display (but keep them in order)
  const editableLayers = layers.filter((l) => l.type !== "system");
  const hasLayers = editableLayers.length > 0;

  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-medium w-72", className)}>
      <div className="p-3 border-b border-border">
        <div className="text-sm font-medium">Layers</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {editableLayers.length} element{editableLayers.length !== 1 ? "s" : ""}
        </div>
      </div>

      {!hasLayers ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Image className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p>No layers yet</p>
          <p className="text-xs mt-1">Add images, text, or stickers</p>
        </div>
      ) : (
        <ScrollArea className="h-64">
          <div className="p-2 space-y-1">
            {/* Reverse to show top layers first */}
            {[...editableLayers].reverse().map((layer, index) => {
              const Icon = getLayerIcon(layer.type);
              const isFirst = index === 0;
              const isLast = index === editableLayers.length - 1;

              return (
                <div
                  key={layer.id}
                  onClick={() => onSelect(layer.id)}
                  className={cn(
                    "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all",
                    layer.selected
                      ? "bg-cta/10 border border-cta/30"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  {/* Layer icon */}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center",
                      layer.visible ? "bg-muted" : "bg-muted/50"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        layer.visible ? "text-foreground" : "text-muted-foreground"
                      )}
                    />
                  </div>

                  {/* Layer name */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-sm truncate",
                        !layer.visible && "text-muted-foreground"
                      )}
                    >
                      {layer.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground capitalize">
                      {layer.type}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Move up */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveUp(layer.id);
                      }}
                      disabled={isFirst}
                      className={cn(
                        "p-1 rounded hover:bg-background transition-colors",
                        isFirst && "opacity-30 cursor-not-allowed"
                      )}
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>

                    {/* Move down */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveDown(layer.id);
                      }}
                      disabled={isLast}
                      className={cn(
                        "p-1 rounded hover:bg-background transition-colors",
                        isLast && "opacity-30 cursor-not-allowed"
                      )}
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(layer.id);
                      }}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Visibility toggle - always visible */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                    className={cn(
                      "p-1.5 rounded transition-colors",
                      layer.visible
                        ? "hover:bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                  >
                    {layer.visible ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Help text */}
      <div className="border-t border-border p-2">
        <p className="text-xs text-muted-foreground text-center">
          Drag to reorder • Click eye to toggle
        </p>
      </div>
    </div>
  );
};
