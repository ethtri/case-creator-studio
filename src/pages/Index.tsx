import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Smartphone, Palette, Package, ChevronRight, Sparkles } from "lucide-react";

const features = [
  {
    icon: Palette,
    title: "Design Your Vision",
    description: "Upload images, add text, shapes, and stickers with our intuitive canvas editor.",
  },
  {
    icon: Smartphone,
    title: "Premium Quality",
    description: "High-quality cases for iPhone and Samsung, printed with precision and care.",
  },
  {
    icon: Package,
    title: "Fast Fulfillment",
    description: "Powered by Printful for reliable production and worldwide shipping.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">CaseStudio</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/catalog">
              <Button variant="ghost">Browse Cases</Button>
            </Link>
            <Link to="/orders">
              <Button variant="ghost">My Orders</Button>
            </Link>
            <Link to="/catalog">
              <Button variant="accent">Start Designing</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-8">
                <Sparkles className="w-4 h-4 text-accent" />
                New: Samsung Galaxy S24 cases now available
              </span>
            </motion.div>

            <motion.h1
              className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Design Your
              <br />
              <span className="text-accent">Perfect Case</span>
            </motion.h1>

            <motion.p
              className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Create stunning custom phone cases with our powerful design editor.
              Premium quality, printed and shipped worldwide.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link to="/catalog">
                <Button variant="hero" size="xl">
                  Start Designing
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link to="/catalog">
                <Button variant="hero-outline" size="xl">
                  Browse Catalog
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Hero Image */}
        <motion.div
          className="mt-16 relative"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          <div className="container mx-auto px-6">
            <div className="relative max-w-5xl mx-auto">
              <div className="aspect-[16/9] rounded-2xl bg-gradient-to-br from-muted to-secondary overflow-hidden shadow-strong">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="grid grid-cols-3 gap-8 p-12">
                    {/* Phone mockups */}
                    <motion.div
                      className="relative"
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 4, repeat: Infinity, delay: 0 }}
                    >
                      <div className="w-32 h-64 rounded-3xl bg-gradient-to-b from-foreground/90 to-foreground shadow-strong mx-auto">
                        <div className="w-full h-full rounded-3xl border-4 border-foreground/10 overflow-hidden">
                          <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/40 flex items-center justify-center">
                            <span className="text-foreground/20 text-xs font-medium">Your Design</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    <motion.div
                      className="relative"
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
                    >
                      <div className="w-36 h-72 rounded-3xl bg-gradient-to-b from-foreground/90 to-foreground shadow-strong mx-auto">
                        <div className="w-full h-full rounded-3xl border-4 border-foreground/10 overflow-hidden">
                          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-primary/30 flex items-center justify-center">
                            <span className="text-foreground/20 text-xs font-medium">Your Design</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    <motion.div
                      className="relative"
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 4, repeat: Infinity, delay: 1 }}
                    >
                      <div className="w-32 h-64 rounded-3xl bg-gradient-to-b from-foreground/90 to-foreground shadow-strong mx-auto">
                        <div className="w-full h-full rounded-3xl border-4 border-foreground/10 overflow-hidden">
                          <div className="w-full h-full bg-gradient-to-br from-success/20 to-success/40 flex items-center justify-center">
                            <span className="text-foreground/20 text-xs font-medium">Your Design</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-surface-sunken">
        <div className="container mx-auto px-6">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Create with Confidence
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to design and order your perfect phone case
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="bg-card rounded-2xl p-8 shadow-soft hover:shadow-medium transition-shadow"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div
            className="max-w-4xl mx-auto text-center bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-12 md:p-16 shadow-strong"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Ready to Create Your Case?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Start designing now and have your custom case delivered to your doorstep.
            </p>
            <Link to="/catalog">
              <Button 
                variant="secondary" 
                size="xl"
                className="font-semibold"
              >
                Choose Your Phone
                <ChevronRight className="w-5 h-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">CaseStudio</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 CaseStudio. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
