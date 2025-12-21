import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bold, Italic, Underline } from "lucide-react";

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  underline: boolean;
}

interface TextStylerProps {
  currentStyle: TextStyle;
  onStyleChange: (style: Partial<TextStyle>) => void;
  hasSelectedText: boolean;
  className?: string;
}

const fonts = [
  { name: "Inter", family: "Inter, sans-serif" },
  { name: "Roboto", family: "Roboto, sans-serif" },
  { name: "Raleway", family: "Raleway, sans-serif" },
  { name: "Oswald", family: "Oswald, sans-serif" },
  { name: "Bebas Neue", family: "'Bebas Neue', sans-serif" },
  { name: "Anton", family: "Anton, sans-serif" },
  { name: "Playfair", family: "'Playfair Display', serif" },
  { name: "Lobster", family: "Lobster, cursive" },
  { name: "Pacifico", family: "Pacifico, cursive" },
  { name: "Dancing Script", family: "'Dancing Script', cursive" },
  { name: "Sacramento", family: "Sacramento, cursive" },
  { name: "Permanent Marker", family: "'Permanent Marker', cursive" },
];

const presetColors = [
  "#000000", // Black
  "#ffffff", // White
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f472b6", // Light Pink
  "#92400e", // Brown
];

export const TextStyler = ({
  currentStyle,
  onStyleChange,
  hasSelectedText,
  className,
}: TextStylerProps) => {
  const [customColor, setCustomColor] = useState(currentStyle.color);

  useEffect(() => {
    setCustomColor(currentStyle.color);
  }, [currentStyle.color]);

  const handleColorChange = (color: string) => {
    setCustomColor(color);
    onStyleChange({ color });
  };

  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-medium w-72", className)}>
      {!hasSelectedText && (
        <div className="p-3 text-center text-sm text-muted-foreground border-b border-border">
          Select a text element to edit its style
        </div>
      )}

      {/* Font Family */}
      <div className="p-3 border-b border-border">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Font</div>
        <ScrollArea className="h-32">
          <div className="space-y-1 pr-2">
            {fonts.map((font) => (
              <button
                key={font.family}
                onClick={() => onStyleChange({ fontFamily: font.family })}
                disabled={!hasSelectedText}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                  currentStyle.fontFamily === font.family
                    ? "bg-cta text-cta-foreground"
                    : "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                style={{ fontFamily: font.family }}
              >
                {font.name}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Font Size */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">Size</span>
          <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">
            {currentStyle.fontSize}px
          </span>
        </div>
        <Slider
          value={[currentStyle.fontSize]}
          onValueChange={([value]) => onStyleChange({ fontSize: value })}
          min={12}
          max={120}
          step={1}
          disabled={!hasSelectedText}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>12px</span>
          <span>120px</span>
        </div>
      </div>

      {/* Text Style Toggles */}
      <div className="p-3 border-b border-border">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Style</div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              onStyleChange({
                fontWeight: currentStyle.fontWeight === "bold" ? "normal" : "bold",
              })
            }
            disabled={!hasSelectedText}
            className={cn(
              "flex-1 h-9 rounded-lg border transition-all flex items-center justify-center",
              currentStyle.fontWeight === "bold"
                ? "bg-cta text-cta-foreground border-cta"
                : "border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              onStyleChange({
                fontStyle: currentStyle.fontStyle === "italic" ? "normal" : "italic",
              })
            }
            disabled={!hasSelectedText}
            className={cn(
              "flex-1 h-9 rounded-lg border transition-all flex items-center justify-center",
              currentStyle.fontStyle === "italic"
                ? "bg-cta text-cta-foreground border-cta"
                : "border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => onStyleChange({ underline: !currentStyle.underline })}
            disabled={!hasSelectedText}
            className={cn(
              "flex-1 h-9 rounded-lg border transition-all flex items-center justify-center",
              currentStyle.underline
                ? "bg-cta text-cta-foreground border-cta"
                : "border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Underline className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Color */}
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Color</div>
        <div className="grid grid-cols-6 gap-2 mb-3">
          {presetColors.map((color) => (
            <button
              key={color}
              onClick={() => handleColorChange(color)}
              disabled={!hasSelectedText}
              className={cn(
                "w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                currentStyle.color.toLowerCase() === color.toLowerCase()
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
              onChange={(e) => handleColorChange(e.target.value)}
              disabled={!hasSelectedText}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div
              className={cn(
                "h-8 rounded-lg border border-border flex items-center justify-center text-xs cursor-pointer hover:border-foreground/30 transition-colors",
                !hasSelectedText && "opacity-50 cursor-not-allowed"
              )}
              style={{ backgroundColor: customColor }}
            >
              <span className="bg-card/80 px-2 py-0.5 rounded text-foreground text-[10px]">
                Custom
              </span>
            </div>
          </label>
          <input
            type="text"
            value={currentStyle.color}
            onChange={(e) => handleColorChange(e.target.value)}
            disabled={!hasSelectedText}
            placeholder="#000000"
            className="w-20 h-8 px-2 text-xs bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cta disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
};

export const defaultTextStyle: TextStyle = {
  fontFamily: "Inter, sans-serif",
  fontSize: 32,
  color: "#000000",
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
};
