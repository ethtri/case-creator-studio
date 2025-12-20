import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { Sparkles, ChevronLeft, ShoppingCart, RotateCcw } from "lucide-react";

const Preview = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [activeView, setActiveView] = useState(0);

  useEffect(() => {
    const foundVariant = getVariantById(variantId || "");
    if (foundVariant) {
      setVariant(foundVariant);
    }

    const preview = sessionStorage.getItem("designPreview");
    if (preview) {
      setDesignPreview(preview);
    }
  }, [variantId]);

  const mockupViews = [
    { name: "Front", angle: 0 },
    { name: "Angled", angle: -15 },
    { name: "Side", angle: 45 },
  ];

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading preview...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Navigation */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">CaseStudio</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/design/${variantId}`)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Editor
            </Button>
            <Button variant="accent" onClick={() => navigate(`/checkout/${variantId}`)}>
              <ShoppingCart className="w-4 h-4 mr-1" />
              Proceed to Checkout
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Mockup Preview */}
          <div>
            <motion.div
              className="relative bg-gradient-to-br from-muted to-secondary rounded-3xl p-12 flex items-center justify-center min-h-[500px]"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                className="relative"
                animate={{ rotateY: mockupViews[activeView].angle }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
              >
                {/* Phone case mockup */}
                <div
                  className="w-48 h-96 rounded-[40px] shadow-strong relative overflow-hidden"
                  style={{ backgroundColor: variant.colorHex }}
                >
                  {/* Design overlay */}
                  {designPreview && (
                    <div
                      className="absolute inset-3 rounded-[32px] overflow-hidden"
                      style={{
                        backgroundImage: `url(${designPreview})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  )}
                  
                  {/* Phone frame details */}
                  <div className="absolute inset-0 rounded-[40px] border-4 border-foreground/10 pointer-events-none" />
                  
                  {/* Notch */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-foreground/20" />
                  
                  {/* Camera bump */}
                  <div className="absolute top-4 left-4 w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-foreground/20" />
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* View toggles */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {mockupViews.map((view, index) => (
                <Button
                  key={view.name}
                  variant={activeView === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveView(index)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {view.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Product Details */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <span className="text-sm text-muted-foreground">Custom Case</span>
              <h1 className="text-3xl font-bold mt-2 mb-4">
                {variant.brand} {variant.model} Case
              </h1>

              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-6 h-6 rounded-full border border-border"
                  style={{ backgroundColor: variant.colorHex }}
                />
                <span className="text-muted-foreground">{variant.color}</span>
              </div>

              <div className="text-3xl font-bold mb-8">
                ${variant.price.toFixed(2)} <span className="text-lg text-muted-foreground font-normal">USD</span>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-medium">Premium Quality</h4>
                    <p className="text-sm text-muted-foreground">
                      High-quality polycarbonate case with precise cutouts
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-medium">Fast Shipping</h4>
                    <p className="text-sm text-muted-foreground">
                      Produced and shipped within 2-4 business days
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  variant="accent"
                  size="xl"
                  className="w-full"
                  onClick={() => navigate(`/checkout/${variantId}`)}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add to Cart - ${variant.price.toFixed(2)}
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => navigate(`/design/${variantId}`)}
                >
                  Edit Design
                </Button>
              </div>

              <p className="text-sm text-muted-foreground text-center mt-4">
                Your design will be printed with high-quality UV printing technology
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preview;
