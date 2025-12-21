import { useState } from "react";
import { cn } from "@/lib/utils";

type FillType = "solid" | "gradient";
type GradientDirection = "to-r" | "to-b" | "to-br" | "to-tr";

interface GradientValue {
  type: "gradient";
  direction: GradientDirection;
  from: string;
  to: string;
}

interface SolidValue {
  type: "solid";
  color: string;
}

export type FillValue = SolidValue | GradientValue;

interface FillColorPickerProps {
  currentFill: FillValue;
  onFillChange: (fill: FillValue) => void;
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

const presetGradients: Omit<GradientValue, "type">[] = [
  { direction: "to-r", from: "#667eea", to: "#764ba2" },
  { direction: "to-r", from: "#f093fb", to: "#f5576c" },
  { direction: "to-r", from: "#4facfe", to: "#00f2fe" },
  { direction: "to-br", from: "#fa709a", to: "#fee140" },
  { direction: "to-r", from: "#a8edea", to: "#fed6e3" },
  { direction: "to-r", from: "#d299c2", to: "#fef9d7" },
  { direction: "to-b", from: "#667eea", to: "#764ba2" },
  { direction: "to-br", from: "#11998e", to: "#38ef7d" },
  { direction: "to-r", from: "#fc5c7d", to: "#6a82fb" },
  { direction: "to-tr", from: "#1e3c72", to: "#2a5298" },
  { direction: "to-r", from: "#ee9ca7", to: "#ffdde1" },
  { direction: "to-br", from: "#000000", to: "#434343" },
];

const directionLabels: Record<GradientDirection, string> = {
  "to-r": "→",
  "to-b": "↓",
  "to-br": "↘",
  "to-tr": "↗",
};

const getGradientStyle = (gradient: Omit<GradientValue, "type">) => {
  const directionMap: Record<GradientDirection, string> = {
    "to-r": "to right",
    "to-b": "to bottom",
    "to-br": "to bottom right",
    "to-tr": "to top right",
  };
  return `linear-gradient(${directionMap[gradient.direction]}, ${gradient.from}, ${gradient.to})`;
};

export const FillColorPicker = ({
  currentFill,
  onFillChange,
  className,
}: FillColorPickerProps) => {
  const [fillType, setFillType] = useState<FillType>(currentFill.type);
  const [customColor, setCustomColor] = useState(
    currentFill.type === "solid" ? currentFill.color : "#ffffff"
  );
  const [gradientFrom, setGradientFrom] = useState(
    currentFill.type === "gradient" ? currentFill.from : "#667eea"
  );
  const [gradientTo, setGradientTo] = useState(
    currentFill.type === "gradient" ? currentFill.to : "#764ba2"
  );
  const [gradientDirection, setGradientDirection] = useState<GradientDirection>(
    currentFill.type === "gradient" ? currentFill.direction : "to-r"
  );

  const handleFillTypeChange = (type: FillType) => {
    setFillType(type);
    if (type === "solid") {
      onFillChange({ type: "solid", color: customColor });
    } else {
      onFillChange({
        type: "gradient",
        direction: gradientDirection,
        from: gradientFrom,
        to: gradientTo,
      });
    }
  };

  const handleSolidColorChange = (color: string) => {
    setCustomColor(color);
    onFillChange({ type: "solid", color });
  };

  const handleGradientPresetClick = (gradient: Omit<GradientValue, "type">) => {
    setGradientFrom(gradient.from);
    setGradientTo(gradient.to);
    setGradientDirection(gradient.direction);
    onFillChange({ type: "gradient", ...gradient });
  };

  const handleGradientChange = (
    from: string,
    to: string,
    direction: GradientDirection
  ) => {
    setGradientFrom(from);
    setGradientTo(to);
    setGradientDirection(direction);
    onFillChange({ type: "gradient", direction, from, to });
  };

  const isGradientSelected = (gradient: Omit<GradientValue, "type">) => {
    return (
      currentFill.type === "gradient" &&
      currentFill.from.toLowerCase() === gradient.from.toLowerCase() &&
      currentFill.to.toLowerCase() === gradient.to.toLowerCase() &&
      currentFill.direction === gradient.direction
    );
  };

  return (
    <div className={cn("bg-card border border-border rounded-xl p-3 shadow-medium", className)}>
      {/* Fill type toggle */}
      <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1">
        <button
          onClick={() => handleFillTypeChange("solid")}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
            fillType === "solid"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Solid
        </button>
        <button
          onClick={() => handleFillTypeChange("gradient")}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
            fillType === "gradient"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Gradient
        </button>
      </div>

      {fillType === "solid" ? (
        <>
          <div className="text-xs text-muted-foreground mb-2 font-medium">Solid Color</div>
          
          {/* Preset colors grid */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {presetColors.map((color) => (
              <button
                key={color}
                onClick={() => handleSolidColorChange(color)}
                className={cn(
                  "w-8 h-8 rounded-lg border-2 transition-all hover:scale-110",
                  currentFill.type === "solid" &&
                    currentFill.color.toLowerCase() === color.toLowerCase()
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
                onChange={(e) => handleSolidColorChange(e.target.value)}
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
              value={currentFill.type === "solid" ? currentFill.color : customColor}
              onChange={(e) => handleSolidColorChange(e.target.value)}
              placeholder="#ffffff"
              className="w-20 h-8 px-2 text-xs bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cta"
            />
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-muted-foreground mb-2 font-medium">Preset Gradients</div>
          
          {/* Preset gradients grid */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {presetGradients.map((gradient, index) => (
              <button
                key={index}
                onClick={() => handleGradientPresetClick(gradient)}
                className={cn(
                  "w-8 h-8 rounded-lg border-2 transition-all hover:scale-110",
                  isGradientSelected(gradient)
                    ? "border-cta ring-2 ring-cta/30"
                    : "border-border/50 hover:border-border"
                )}
                style={{ background: getGradientStyle(gradient) }}
                title={`${gradient.from} → ${gradient.to}`}
              />
            ))}
          </div>

          {/* Custom gradient controls */}
          <div className="text-xs text-muted-foreground mb-2 font-medium">Custom Gradient</div>
          
          {/* Direction selector */}
          <div className="flex gap-1 mb-3">
            {(Object.keys(directionLabels) as GradientDirection[]).map((dir) => (
              <button
                key={dir}
                onClick={() => handleGradientChange(gradientFrom, gradientTo, dir)}
                className={cn(
                  "flex-1 h-7 text-sm rounded-md border transition-all",
                  gradientDirection === dir
                    ? "bg-cta text-cta-foreground border-cta"
                    : "bg-muted text-muted-foreground border-border hover:border-foreground/30"
                )}
              >
                {directionLabels[dir]}
              </button>
            ))}
          </div>

          {/* Color pickers for gradient */}
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <input
                type="color"
                value={gradientFrom}
                onChange={(e) =>
                  handleGradientChange(e.target.value, gradientTo, gradientDirection)
                }
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div
                className="h-8 rounded-lg border border-border flex items-center justify-center text-xs cursor-pointer hover:border-foreground/30 transition-colors"
                style={{ backgroundColor: gradientFrom }}
              >
                <span className="bg-card/80 px-2 py-0.5 rounded text-foreground text-[10px]">From</span>
              </div>
            </label>
            <label className="relative flex-1">
              <input
                type="color"
                value={gradientTo}
                onChange={(e) =>
                  handleGradientChange(gradientFrom, e.target.value, gradientDirection)
                }
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div
                className="h-8 rounded-lg border border-border flex items-center justify-center text-xs cursor-pointer hover:border-foreground/30 transition-colors"
                style={{ backgroundColor: gradientTo }}
              >
                <span className="bg-card/80 px-2 py-0.5 rounded text-foreground text-[10px]">To</span>
              </div>
            </label>
          </div>

          {/* Preview */}
          <div
            className="mt-3 h-8 rounded-lg border border-border"
            style={{
              background: getGradientStyle({
                direction: gradientDirection,
                from: gradientFrom,
                to: gradientTo,
              }),
            }}
          />
        </>
      )}
    </div>
  );
};

// Helper to convert FillValue to CSS background
export const fillValueToCss = (fill: FillValue): string => {
  if (fill.type === "solid") {
    return fill.color;
  }
  return getGradientStyle(fill);
};
