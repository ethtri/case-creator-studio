import { useState } from "react";
import { cn } from "@/lib/utils";

interface FillColorPickerProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  className?: string;
}

const presetColors = [
  "#ffffff", // White
  "#f5f5f5", // Light gray
  "#000000", // Black
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f472b6", // Light Pink
];

export const FillColorPicker = ({
  currentColor,
  onColorChange,
  className,
}: FillColorPickerProps) => {
  const [customColor, setCustomColor] = useState(currentColor);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    onColorChange(color);
  };

  return (
    <div className={cn("bg-card border border-border rounded-xl p-3 shadow-medium", className)}>
      <div className="text-xs text-muted-foreground mb-2 font-medium">Background Color</div>
      
      {/* Preset colors grid */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        {presetColors.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className={cn(
              "w-8 h-8 rounded-lg border-2 transition-all hover:scale-110",
              currentColor.toLowerCase() === color.toLowerCase()
                ? "border-cta ring-2 ring-cta/30"
                : "border-border/50 hover:border-border"
            )}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Custom color picker */}
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <input
            type="color"
            value={customColor}
            onChange={handleCustomColorChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <div
            className="h-8 rounded-lg border border-border flex items-center justify-center text-xs text-muted-foreground cursor-pointer hover:border-foreground/30 transition-colors"
            style={{ backgroundColor: customColor }}
          >
            <span className="bg-card/80 px-2 py-0.5 rounded text-foreground">Custom</span>
          </div>
        </label>
        <input
          type="text"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          placeholder="#ffffff"
          className="w-20 h-8 px-2 text-xs bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cta"
        />
      </div>
    </div>
  );
};
