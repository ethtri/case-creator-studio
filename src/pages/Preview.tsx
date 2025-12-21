import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { ChevronLeft, ShoppingCart, BadgeCheck, Truck, Check, Smartphone, Eye } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CartSheet } from "@/components/CartSheet";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

// Import mockup images
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import iphoneCaseAngled from "@/assets/mockups/iphone-case-angled.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";
import samsungCaseAngled from "@/assets/mockups/samsung-case-angled.png";

type MockupView = "front" | "angled";

const getMockupImage = (brand: string, view: MockupView): string => {
  const isApple = brand.toLowerCase() === "apple";
  return view === "angled" 
    ? (isApple ? iphoneCaseAngled : samsungCaseAngled)
    : (isApple ? iphoneCaseFront : samsungCaseFront);
};

const Preview = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MockupView>("front");
  const [addedToCart, setAddedToCart] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    } else {
      // If no variant found, redirect to catalog
      navigate("/catalog");
      return;
    }

    // Get preview from session storage
    const preview = sessionStorage.getItem("designPreview");
    const storedVariant = sessionStorage.getItem("designVariant");
    
    if (preview && storedVariant === variantId) {
      setDesignPreview(preview);
    } else if (!preview) {
      // No design, redirect back to editor
      navigate(`/design/${variantId}`);
    }
  }, [variantId, navigate]);

  const handleAddToCart = () => {
    if (variant && designPreview) {
      addToCart(variant, designPreview);
      setAddedToCart(true);
      toast.success("Added to cart!");
      setTimeout(() => setAddedToCart(false), 2000);
    }
  };

  const mockupViews: { name: string; view: MockupView; icon: typeof Eye }[] = [
    { name: "Front", view: "front", icon: Smartphone },
    { name: "3D View", view: "angled", icon: Eye },
  ];

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-cta border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </div>
    );
  }

  const isApple = variant.brand.toLowerCase() === "apple";

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <CartSheet />
            <Button
              variant="outline"
              onClick={() => navigate(`/design/${variantId}`)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Editor
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Mockup Preview */}
          <div className="sticky top-6">
            {/* Main mockup display */}
            <motion.div
              className="relative bg-gradient-to-br from-muted via-muted/50 to-secondary rounded-3xl p-8 lg:p-12 flex items-center justify-center min-h-[500px] overflow-hidden"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              {/* Background pattern for visual interest */}
              <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 1px)`,
                backgroundSize: "24px 24px"
              }} />
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, scale: 0.9, rotateY: activeView === "angled" ? -30 : 10 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  className="relative"
                  style={{ perspective: "1200px" }}
                >
                  {/* Realistic 3D Phone Case Mockup */}
                  <div className="relative w-56 lg:w-64">
                    {/* Large ambient shadow */}
                    <div 
                      className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-b from-black/10 to-black/40 blur-3xl translate-y-8 scale-[0.85]"
                    />
                    
                    {/* Mockup image with design overlay */}
                    <div className="relative">
                      <img
                        src={getMockupImage(variant.brand, activeView)}
                        alt={`${variant.brand} ${variant.model} case`}
                        className="w-full h-auto drop-shadow-2xl relative z-10"
                        draggable={false}
                      />
                      
                      {/* Design overlay - positioned to match case surface */}
                      {designPreview && (
                        <div 
                          className={`absolute z-[20] overflow-hidden ${
                            activeView === "front" 
                              ? isApple 
                                ? "inset-[4%] rounded-[2rem]" 
                                : "inset-[3%] rounded-[1.5rem]"
                              : isApple
                                ? "top-[10%] left-[15%] right-[20%] bottom-[8%] rounded-[1.5rem]"
                                : "top-[8%] left-[12%] right-[18%] bottom-[6%] rounded-[1.2rem]"
                          }`}
                          style={{
                            transform: activeView === "angled" 
                              ? "perspective(1000px) rotateY(-8deg) rotateX(3deg)" 
                              : undefined,
                          }}
                        >
                          <img
                            src={designPreview}
                            alt="Your custom design"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* View toggles - pill style */}
            <div className="flex items-center justify-center mt-6">
              <div className="inline-flex rounded-full bg-muted p-1">
                {mockupViews.map((item) => (
                  <button
                    key={item.view}
                    onClick={() => setActiveView(item.view)}
                    className={`
                      relative flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200
                      ${activeView === item.view 
                        ? "bg-card text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                      }
                    `}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Thumbnail strip for quick preview */}
            <div className="flex items-center justify-center gap-3 mt-4">
              {mockupViews.map((item) => (
                <button
                  key={`thumb-${item.view}`}
                  onClick={() => setActiveView(item.view)}
                  className={`
                    relative w-16 h-20 rounded-xl overflow-hidden transition-all duration-200 bg-muted
                    ${activeView === item.view 
                      ? "ring-2 ring-cta ring-offset-2 ring-offset-background" 
                      : "opacity-60 hover:opacity-100"
                    }
                  `}
                >
                  <img
                    src={getMockupImage(variant.brand, item.view)}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Product Details */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="space-y-8"
            >
              {/* Product title */}
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-cta/10 text-cta text-xs font-medium mb-3">
                  Custom Design
                </span>
                <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                  {variant.brand} {variant.model}
                </h1>
                <p className="text-lg text-muted-foreground">
                  Snap Case • Premium Polycarbonate
                </p>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">${variant.price.toFixed(2)}</span>
                <span className="text-lg text-muted-foreground">USD</span>
              </div>

              {/* Features */}
              <div className="grid gap-4">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cta/20 to-cta/10 flex items-center justify-center shrink-0">
                    <BadgeCheck className="w-5 h-5 text-cta" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Premium Quality</h4>
                    <p className="text-sm text-muted-foreground">
                      Impact-resistant polycarbonate with precise cutouts for all ports and cameras
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cta/20 to-cta/10 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-cta" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Fast Global Shipping</h4>
                    <p className="text-sm text-muted-foreground">
                      Printed and shipped within 2-4 business days worldwide
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4">
                <Button
                  size="xl"
                  className={`w-full h-14 text-lg font-semibold ${
                    addedToCart 
                      ? 'bg-success hover:bg-success/90' 
                      : 'bg-cta hover:bg-cta/90'
                  } text-cta-foreground shadow-lg shadow-cta/25`}
                  onClick={handleAddToCart}
                  disabled={addedToCart}
                >
                  {addedToCart ? (
                    <>
                      <Check className="w-5 h-5 mr-2" />
                      Added to Cart!
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      Add to Cart — ${variant.price.toFixed(2)}
                    </>
                  )}
                </Button>
                
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full h-12"
                  onClick={() => navigate(`/checkout/${variantId}`)}
                >
                  Proceed to Checkout
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate("/catalog")}
                  >
                    New Design
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full"
                    onClick={() => navigate(`/design/${variantId}`)}
                  >
                    Edit Design
                  </Button>
                </div>
              </div>

              {/* Trust badge */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground text-center">
                  🎨 Printed with high-quality UV technology for vibrant, long-lasting colors
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
