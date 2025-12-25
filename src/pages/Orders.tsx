import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Loader2, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/contexts/AuthContext";

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

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-accent/10 text-accent",
  submitted: "bg-primary/10 text-primary",
  processing: "bg-primary/10 text-primary",
  fulfilling: "bg-primary/10 text-primary",
  shipped: "bg-success/10 text-success",
  delivered: "bg-success/10 text-success",
  canceled: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
};

const OrdersContent = () => {
  const { signOut } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [claimZip, setClaimZip] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("my-orders");
      if (error) {
        toast.error("Unable to load orders. Please try again.");
        setOrders([]);
        return;
      }
      setOrders(data?.orders || []);
    } catch (err) {
      console.error("Order fetch error:", err);
      toast.error("Unable to load orders. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleClaimOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimZip.trim()) {
      toast.error("Enter the ZIP code used at checkout.");
      return;
    }

    setIsClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-orders", {
        body: { zip: claimZip.trim() },
      });
      if (error) {
        toast.error("Unable to claim orders. Please try again.");
        return;
      }
      const claimedCount = data?.claimedCount ?? 0;
      if (claimedCount > 0) {
        toast.success(`Claimed ${claimedCount} order(s).`);
        fetchOrders();
      } else {
        toast.info("No matching orders found for that ZIP code.");
      }
    } catch (err) {
      console.error("Claim error:", err);
      toast.error("Unable to claim orders. Please try again.");
    } finally {
      setIsClaiming(false);
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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/designs">
              <Button variant="ghost">My Designs</Button>
            </Link>
            <Link to="/catalog">
              <Button variant="ghost">Browse Cases</Button>
            </Link>
            <Button variant="ghost" onClick={signOut}>
              Sign Out
            </Button>
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
                Track your purchases and reorder your favorites.
              </p>
            </div>
            <Link to="/catalog">
              <Button className="bg-cta hover:bg-cta/90 text-cta-foreground">
                <Plus className="w-4 h-4 mr-1" />
                New Design
              </Button>
            </Link>
          </div>

          <div className="bg-card rounded-2xl p-6 shadow-soft mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold mb-1">Claim past orders</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  If you checked out before creating an account, enter the shipping ZIP code to link past orders.
                </p>
                <form onSubmit={handleClaimOrders} className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Label htmlFor="zip">Shipping ZIP code</Label>
                    <Input
                      id="zip"
                      value={claimZip}
                      onChange={(e) => setClaimZip(e.target.value)}
                      placeholder="e.g. 94107"
                      maxLength={20}
                      disabled={isClaiming}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="bg-cta hover:bg-cta/90 text-cta-foreground mt-6 sm:mt-0"
                    disabled={isClaiming}
                  >
                    {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : "Claim Orders"}
                  </Button>
                </form>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
              <Loader2 className="w-10 h-10 text-muted-foreground animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading your orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-6">
                Once you purchase a case, it will appear here.
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
                          <h3 className="font-semibold">Order #{order.id.slice(0, 8)}</h3>
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
        </motion.div>
      </div>
    </div>
  );
};

const Orders = () => (
  <RequireAuth>
    <OrdersContent />
  </RequireAuth>
);

export default Orders;
