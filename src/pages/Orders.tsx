import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Package, ChevronRight, Plus } from "lucide-react";

// Mock orders for display
const mockOrders = [
  {
    id: "ORD-001",
    date: "2024-01-15",
    status: "shipped",
    total: 29.98,
    product: "iPhone 15 Pro Max Case",
    color: "Black Titanium",
  },
  {
    id: "ORD-002",
    date: "2024-01-10",
    status: "delivered",
    total: 24.98,
    product: "Galaxy S24 Ultra Case",
    color: "Titanium Gray",
  },
];

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  paid: "bg-accent/10 text-accent",
  submitted: "bg-primary/10 text-primary",
  fulfilling: "bg-primary/10 text-primary",
  shipped: "bg-success/10 text-success",
  delivered: "bg-success/10 text-success",
};

const Orders = () => {
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

          {mockOrders.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl shadow-soft">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first custom case to get started
              </p>
              <Link to="/catalog">
                <Button className="bg-cta hover:bg-cta/90 text-cta-foreground">Start Designing</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {mockOrders.map((order, index) => (
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
                          <h3 className="font-semibold">{order.id}</h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              statusColors[order.status] || "bg-muted text-muted-foreground"
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {order.product} • {order.color}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Ordered on {new Date(order.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold">${order.total.toFixed(2)}</span>
                      <Link to={`/orders/${order.id}`}>
                        <Button variant="ghost" size="sm">
                          View Details
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
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

export default Orders;
