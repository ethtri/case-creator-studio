import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, ChevronRight, Plus, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

interface OrderItem {
  brand: string;
  model: string;
  quantity: number;
}

interface Order {
  id: string;
  date: string;
  status: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  items: OrderItem[];
}

const emailSchema = z.string().email("Please enter a valid email address").max(255);

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-accent/10 text-accent",
  submitted: "bg-primary/10 text-primary",
  fulfilling: "bg-primary/10 text-primary",
  shipped: "bg-success/10 text-success",
  delivered: "bg-success/10 text-success",
  canceled: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
};

const Orders = () => {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleLookupOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    
    // Validate email
    const validation = emailSchema.safeParse(email.trim());
    if (!validation.success) {
      setEmailError(validation.error.errors[0]?.message || "Invalid email");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke("lookup-orders", {
        body: { email: validation.data },
      });

      if (error) {
        console.error("Error looking up orders:", error);
        toast.error("Unable to look up orders. Please try again.");
        setOrders([]);
        return;
      }

      if (data?.orders) {
        setOrders(data.orders);
        if (data.orders.length === 0) {
          toast.info("No orders found for this email address.");
        }
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error("Error:", err);
      toast.error("Unable to look up orders. Please try again.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const getProductSummary = (items: OrderItem[]) => {
    if (!items || items.length === 0) return "Custom Phone Case";
    const firstItem = items[0];
    const moreItems = items.length > 1 ? ` +${items.length - 1} more` : "";
    return `${firstItem.brand} ${firstItem.model} Case${moreItems}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/catalog">
              <Button variant="ghost">Browse Cases</Button>
            </Link>
            <Link to="/orders">
              <Button variant="ghost">My Orders</Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-6 pt-28 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Orders</h1>
              <p className="text-muted-foreground">
                Track and manage your custom case orders
              </p>
            </div>
            <Link to="/catalog">
              <Button className="bg-cta hover:bg-cta/90 text-cta-foreground">
                <Plus className="w-4 h-4 mr-1" />
                New Design
              </Button>
            </Link>
          </div>

          {/* Email Lookup Form */}
          <div className="bg-card rounded-2xl p-6 shadow-soft mb-8">
            <form onSubmit={handleLookupOrders} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm font-medium">
                  Enter your email to view your orders
                </Label>
                <div className="flex gap-3 mt-2">
                  <div className="flex-1">
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(null);
                      }}
                      className={emailError ? "border-destructive" : ""}
                      disabled={isLoading}
                      maxLength={255}
                    />
                    {emailError && (
                      <p className="text-sm text-destructive mt-1">{emailError}</p>
                    )}
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !email.trim()}
                    className="bg-cta hover:bg-cta/90 text-cta-foreground"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-1" />
                        Look Up
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {/* Orders List */}
          {hasSearched && (
            <>
              {orders.length === 0 ? (
                <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No orders found</h3>
                  <p className="text-muted-foreground mb-6">
                    No orders were found for this email address.
                    <br />
                    Make sure you're using the same email you used at checkout.
                  </p>
                  <Link to="/catalog">
                    <Button className="bg-cta hover:bg-cta/90 text-cta-foreground">
                      Start Designing
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      className="bg-card rounded-2xl p-6 shadow-soft hover:shadow-medium transition-shadow"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-24 rounded-xl bg-muted flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-semibold">Order #{order.id}</h3>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                                  statusColors[order.status] || "bg-muted text-muted-foreground"
                                }`}
                              >
                                {order.status}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getProductSummary(order.items)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Ordered on {new Date(order.date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold">${order.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Initial State (before search) */}
          {!hasSearched && (
            <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Look up your orders</h3>
              <p className="text-muted-foreground">
                Enter the email address you used during checkout to view your order history.
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Orders;
