import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVariantById, PhoneVariant } from "@/data/phoneVariants";
import { toast } from "sonner";
import { Sparkles, ChevronLeft, Lock, CreditCard, Package } from "lucide-react";

const Checkout = () => {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [variant, setVariant] = useState<PhoneVariant | null>(null);
  const [designPreview, setDesignPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
  });

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    // Simulate checkout process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    toast.success("Order placed successfully!");
    navigate("/orders");
    setIsProcessing(false);
  };

  const shippingCost = 4.99;
  const total = variant ? variant.price + shippingCost : 0;

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading checkout...</p>
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
          <Button
            variant="ghost"
            onClick={() => navigate(`/preview/${variantId}`)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Preview
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl font-bold mb-2">Checkout</h1>
            <p className="text-muted-foreground mb-8">
              Complete your order to get your custom case
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Form */}
            <div className="lg:col-span-2">
              <motion.form
                onSubmit={handleSubmit}
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                {/* Contact */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="you@example.com"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Shipping */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        required
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        required
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        name="address"
                        required
                        value={formData.address}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        name="city"
                        required
                        value={formData.city}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zip">ZIP Code</Label>
                      <Input
                        id="zip"
                        name="zip"
                        required
                        value={formData.zip}
                        onChange={handleInputChange}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        className="mt-1"
                        disabled
                      />
                    </div>
                  </div>
                </div>

                {/* Payment placeholder */}
                <div className="bg-card rounded-2xl p-6 shadow-soft">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    Payment
                  </h2>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Stripe payment integration will be added here
                    </p>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  size="xl"
                  className="w-full"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Place Order - ${total.toFixed(2)}
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Your payment information is secured with SSL encryption
                </p>
              </motion.form>
            </div>

            {/* Order Summary */}
            <div>
              <motion.div
                className="bg-card rounded-2xl p-6 shadow-soft sticky top-24"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

                {/* Product preview */}
                <div className="flex gap-4 pb-4 border-b border-border">
                  <div
                    className="w-16 h-24 rounded-xl flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: variant.colorHex }}
                  >
                    {designPreview && (
                      <img
                        src={designPreview}
                        alt="Design preview"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-sm">Custom Case</h3>
                    <p className="text-sm text-muted-foreground">
                      {variant.brand} {variant.model}
                    </p>
                    <p className="text-sm text-muted-foreground">{variant.color}</p>
                  </div>
                  <p className="font-medium">${variant.price.toFixed(2)}</p>
                </div>

                {/* Totals */}
                <div className="py-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${variant.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Shipping
                    </span>
                    <span>${shippingCost.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between font-semibold pt-4 border-t border-border">
                  <span>Total</span>
                  <span>${total.toFixed(2)} USD</span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
