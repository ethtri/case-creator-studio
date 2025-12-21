import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DpiIndicatorProps {
  dpi: number | null;
  className?: string;
}

export type DpiQuality = "great" | "good" | "poor" | null;

export const getDpiQuality = (dpi: number | null): DpiQuality => {
  if (dpi === null) return null;
  if (dpi >= 250) return "great";
  if (dpi >= 150) return "good";
  return "poor";
};

export const DpiIndicator = ({ dpi, className }: DpiIndicatorProps) => {
  const quality = getDpiQuality(dpi);

  if (quality === null) return null;

  const config = {
    great: {
      label: "DPI: Great",
      icon: CheckCircle,
      classes: "bg-success/10 text-success border-success/30",
    },
    good: {
      label: "DPI: Good",
      icon: AlertTriangle,
      classes: "bg-warning/10 text-warning border-warning/30",
    },
    poor: {
      label: "DPI: Low",
      icon: XCircle,
      classes: "bg-destructive/10 text-destructive border-destructive/30",
    },
  };

  const { label, icon: Icon, classes } = config[quality];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border",
        classes,
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
  );
};
