import { useState } from "react";
import { cn } from "@/lib/utils";
import { clipartCategories, getClipartByCategory, ClipartItem } from "@/data/clipartData";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClipartPickerProps {
  onSelect: (clipart: ClipartItem) => void;
  className?: string;
}

export const ClipartPicker = ({ onSelect, className }: ClipartPickerProps) => {
  const [activeCategory, setActiveCategory] = useState("popular");
  const clipartItems = getClipartByCategory(activeCategory);

  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-medium w-72", className)}>
      {/* Category tabs */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-1 p-2 min-w-max">
          {clipartCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                activeCategory === category.id
                  ? "bg-cta text-cta-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              )}
            >
              <span>{category.icon}</span>
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Clipart grid */}
      <ScrollArea className="h-64">
        <div className="grid grid-cols-4 gap-2 p-3">
          {clipartItems.map((clipart) => (
            <button
              key={clipart.id}
              onClick={() => onSelect(clipart)}
              className="group aspect-square p-2 rounded-lg border border-border bg-background hover:border-cta hover:bg-cta/5 transition-all flex items-center justify-center"
              title={clipart.name}
            >
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ color: clipart.defaultColor }}
                dangerouslySetInnerHTML={{ __html: clipart.svg }}
              />
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Help text */}
      <div className="border-t border-border p-2">
        <p className="text-xs text-muted-foreground text-center">
          Click to add sticker to canvas
        </p>
      </div>
    </div>
  );
};
