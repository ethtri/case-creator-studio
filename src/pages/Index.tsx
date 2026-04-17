import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Smartphone, Palette, Package, ChevronRight, Truck, RotateCcw, BadgeCheck, Clock } from "lucide-react";
import heroWide from "@/assets/hero-wide.png";
import heroNarrow from "@/assets/hero-narrow.png";
import { phoneVariants } from "@/data/phoneVariants";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";

const steps = [
  {
    number: "01",
    title: "Choose your model",
    description: "Pick from the latest iPhone and Samsung devices.",
  },
  {
    number: "02",
    title: "Design your case",
    description: "Upload images, add text, and make it uniquely yours.",
  },
  {
    number: "03",
    title: "Checkout & ship",
    description: "We print and ship worldwide.",
  },
];

const popularModels = phoneVariants.slice(0, 4);

const faqs = [
  {
    icon: Truck,
    title: "Worldwide Shipping",
    description: "Free shipping on orders over $50. Standard delivery 5-10 business days.",
  },
  {
    icon: RotateCcw,
    title: "Easy Returns",
    description: "30-day hassle-free returns if you're not completely satisfied.",
  },
  {
    icon: BadgeCheck,
    title: "Premium Quality",
    description: "Durable polycarbonate with matte or glossy finish options.",
  },
  {
    icon: Clock,
    title: "Fast Turnaround",
    description: "Orders printed and shipped within 2-5 business days.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background Images - Wide for desktop, Narrow for mobile */}
        <div className="absolute inset-0">
          <img 
            src={heroWide} 
            alt="" 
            className="hidden md:block w-full h-full object-cover"
          />
          <img 
            src={heroNarrow} 
            alt="" 
            className="md:hidden w-full h-full object-cover"
          />
          {/* Dark gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
        </div>

        <div className="container relative z-10 mx-auto px-6 pt-24 pb-16">
          <div className="max-w-2xl">
            <motion.h1
              className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground mb-6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              Print your
              <br />
              story.
            </motion.h1>

            <motion.p
              className="text-lg md:text-xl text-muted-foreground max-w-md mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Design your own phone case in minutes. We print + ship worldwide.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row items-start gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link to="/catalog">
                <Button size="lg" className="bg-cta hover:bg-cta/90 text-cta-foreground font-semibold px-8 py-6 text-base shadow-glow">
                  Start designing
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 bg-surface-sunken">
        <div className="container mx-auto px-6">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps to your custom phone case
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cta/10 border border-cta/30 mb-6">
                  <span className="font-display font-bold text-cta text-lg">{step.number}</span>
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Models Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div
            className="flex items-center justify-between mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
                Popular models
              </h2>
              <p className="text-muted-foreground">Start with the most popular devices</p>
            </div>
            <Link to="/catalog" className="hidden md:block">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                View all
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularModels.map((variant, index) => (
              <motion.div
                key={variant.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Link to={`/design/${variant.id}`}>
                  <div className="group bg-card rounded-2xl p-6 border border-border/50 hover:border-cta/30 transition-all duration-300 hover:shadow-medium">
                    <div className="aspect-square rounded-xl bg-muted/50 mb-4 flex items-center justify-center overflow-hidden">
                      <div className="w-20 h-40 rounded-2xl bg-gradient-to-b from-muted-foreground/20 to-muted-foreground/10 border border-muted-foreground/20 group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">{variant.model}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{variant.brand}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-cta font-semibold">${variant.price}</span>
                      <span className="text-xs text-muted-foreground group-hover:text-accent transition-colors">
                        Design now →
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 text-center md:hidden">
            <Link to="/catalog">
              <Button variant="outline" className="border-border text-foreground">
                View all models
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust/FAQ Section */}
      <section className="py-24 bg-surface-sunken">
        <div className="container mx-auto px-6">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Snapcase?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Quality, speed, and satisfaction guaranteed
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.title}
                className="bg-card rounded-2xl p-6 border border-border/50"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className="w-12 h-12 rounded-xl bg-cta/10 flex items-center justify-center mb-4">
                  <faq.icon className="w-6 h-6 text-cta" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{faq.title}</h3>
                <p className="text-sm text-muted-foreground">{faq.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <Link to="/custom-phone-case" className="hover:text-foreground transition-colors">Custom Cases</Link>
              <Link to="/gifts/custom-phone-case" className="hover:text-foreground transition-colors">Gift Ideas</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 snapcase.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
