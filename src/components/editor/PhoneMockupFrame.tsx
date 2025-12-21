import { motion } from "framer-motion";
import { PhoneVariant } from "@/data/phoneVariants";
import { cn } from "@/lib/utils";

// Import mockup images
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import iphoneCaseAngled from "@/assets/mockups/iphone-case-angled.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";
import samsungCaseAngled from "@/assets/mockups/samsung-case-angled.png";

export type MockupView = "front" | "angled" | "side";

interface PhoneMockupFrameProps {
  variant: PhoneVariant;
  view?: MockupView;
  children?: React.ReactNode;
  className?: string;
  showDesignOverlay?: boolean;
}

// Get the appropriate mockup image based on brand and view
const getMockupImage = (brand: string, view: MockupView): string => {
  const isApple = brand.toLowerCase() === "apple";
  
  switch (view) {
    case "angled":
      return isApple ? iphoneCaseAngled : samsungCaseAngled;
    case "side":
      return isApple ? iphoneCaseFront : samsungCaseFront; // Use front as fallback for side
    case "front":
    default:
      return isApple ? iphoneCaseFront : samsungCaseFront;
  }
};

// Design area positioning for overlaying the user's design on the mockup
// These values define where the design should be positioned relative to the mockup image
const getDesignAreaStyle = (brand: string, view: MockupView): React.CSSProperties => {
  const isApple = brand.toLowerCase() === "apple";
  
  if (view === "front") {
    return isApple ? {
      position: "absolute",
      top: "2%",
      left: "3%",
      width: "94%",
      height: "96%",
      borderRadius: "8%",
      overflow: "hidden",
    } : {
      position: "absolute",
      top: "1%",
      left: "2%",
      width: "96%",
      height: "97%",
      borderRadius: "6%",
      overflow: "hidden",
    };
  }
  
  // For angled view, apply perspective transform
  if (view === "angled") {
    return isApple ? {
      position: "absolute",
      top: "8%",
      left: "12%",
      width: "78%",
      height: "84%",
      borderRadius: "6%",
      overflow: "hidden",
      transform: "perspective(1000px) rotateY(-15deg) rotateX(5deg)",
      transformOrigin: "center center",
    } : {
      position: "absolute",
      top: "6%",
      left: "10%",
      width: "80%",
      height: "88%",
      borderRadius: "5%",
      overflow: "hidden",
      transform: "perspective(1000px) rotateY(-20deg) rotateX(8deg)",
      transformOrigin: "center center",
    };
  }
  
  return {};
};

export const PhoneMockupFrame = ({
  variant,
  view = "front",
  children,
  className,
  showDesignOverlay = false,
}: PhoneMockupFrameProps) => {
  const mockupImage = getMockupImage(variant.brand, view);
  const designAreaStyle = getDesignAreaStyle(variant.brand, view);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("relative", className)}
    >
      {/* Mockup Image - Realistic 3D case shell */}
      <img
        src={mockupImage}
        alt={`${variant.brand} ${variant.model} case mockup`}
        className="w-full h-auto drop-shadow-2xl"
        draggable={false}
      />
      
      {/* Design Overlay Area - Where the user's design appears */}
      {showDesignOverlay && children && (
        <div style={designAreaStyle} className="pointer-events-none">
          {children}
        </div>
      )}
    </motion.div>
  );
};

// Component for displaying multiple views like Printful EDM
export const MultiViewMockup = ({
  variant,
  designPreview,
  className,
}: {
  variant: PhoneVariant;
  designPreview?: string;
  className?: string;
}) => {
  return (
    <div className={cn("grid grid-cols-2 gap-4", className)}>
      {/* Main Front View */}
      <div className="col-span-2 md:col-span-1">
        <PhoneMockupFrame
          variant={variant}
          view="front"
          showDesignOverlay={!!designPreview}
        >
          {designPreview && (
            <img
              src={designPreview}
              alt="Your design"
              className="w-full h-full object-cover"
            />
          )}
        </PhoneMockupFrame>
      </div>
      
      {/* Angled View */}
      <div className="col-span-2 md:col-span-1">
        <PhoneMockupFrame
          variant={variant}
          view="angled"
          showDesignOverlay={!!designPreview}
        >
          {designPreview && (
            <img
              src={designPreview}
              alt="Your design - angled view"
              className="w-full h-full object-cover"
            />
          )}
        </PhoneMockupFrame>
      </div>
    </div>
  );
};
