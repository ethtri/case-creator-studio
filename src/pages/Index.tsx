import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bell, ChevronRight, CreditCard, Eye, Smartphone } from "lucide-react";
import heroWide960Avif from "@/assets/hero-wide-960.avif";
import heroWide1536Avif from "@/assets/hero-wide-1536.avif";
import heroWide960Webp from "@/assets/hero-wide-960.webp";
import heroWide1536Webp from "@/assets/hero-wide-1536.webp";
import heroWide960Jpeg from "@/assets/hero-wide-960.jpg";
import heroWide1536Jpeg from "@/assets/hero-wide-1536.jpg";
import heroNarrow640Avif from "@/assets/hero-narrow-640.avif";
import heroNarrow1024Avif from "@/assets/hero-narrow-1024.avif";
import heroNarrow640Webp from "@/assets/hero-narrow-640.webp";
import heroNarrow1024Webp from "@/assets/hero-narrow-1024.webp";
import heroNarrow640Jpeg from "@/assets/hero-narrow-640.jpg";
import heroNarrow1024Jpeg from "@/assets/hero-narrow-1024.jpg";
import { phoneVariants } from "@/data/phoneVariants";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { trackMarketingEvent } from "@/lib/marketing";
import { asMarketingItems, buildAnalyticsItem } from "@/lib/analytics-commerce";

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
    title: "Review and checkout",
    description: "Confirm your order, then continue to Stripe for payment and shipping details.",
  },
];

const popularModels = phoneVariants.slice(0, 4);

const faqs = [
  {
    icon: Eye,
    title: "Preview first",
    description: "Review your artwork on the selected case before adding it to your cart.",
  },
  {
    icon: Smartphone,
    title: "Choose the exact model",
    description: "Start with a supported iPhone or Samsung model so your order stays specific.",
  },
  {
    icon: CreditCard,
    title: "Secure checkout",
    description: "Review the price before the editor, then pay through Stripe checkout.",
  },
  {
    icon: Bell,
    title: "Order updates",
    description: "Check your order status online and see tracking when it becomes available.",
  },
];

const Index = () => {
  const currentYear = new Date().getFullYear();

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
        {/* The picture sources let the browser request one viewport-appropriate hero. */}
        <div className="absolute inset-0">
          <picture className="block h-full w-full">
            <source
              media="(min-width: 768px)"
              type="image/avif"
              srcSet={`${heroWide960Avif} 960w, ${heroWide1536Avif} 1536w`}
              sizes="100vw"
            />
            <source
              media="(min-width: 768px)"
              type="image/webp"
              srcSet={`${heroWide960Webp} 960w, ${heroWide1536Webp} 1536w`}
              sizes="100vw"
            />
            <source
              media="(min-width: 768px)"
              type="image/jpeg"
              srcSet={`${heroWide960Jpeg} 960w, ${heroWide1536Jpeg} 1536w`}
              sizes="100vw"
            />
            <source
              type="image/avif"
              srcSet={`${heroNarrow640Avif} 640w, ${heroNarrow1024Avif} 1024w`}
              sizes="100vw"
            />
            <source
              type="image/webp"
              srcSet={`${heroNarrow640Webp} 640w, ${heroNarrow1024Webp} 1024w`}
              sizes="100vw"
            />
            <img
              src={heroNarrow1024Jpeg}
              srcSet={`${heroNarrow640Jpeg} 640w, ${heroNarrow1024Jpeg} 1024w`}
              sizes="100vw"
              alt=""
              aria-hidden="true"
              width="1024"
              height="1024"
              {...{ fetchpriority: "high" }}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </picture>
          {/* Dark gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50" />
        </div>

        <div className="container relative z-10 mx-auto px-6 pt-24 pb-16">
          <div className="max-w-2xl">
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground mb-6">
              Print your
              <br />
              story.
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-md mb-10">
              Choose your phone, create the design, and review a preview before checkout.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                to="/catalog"
                onClick={() =>
                  trackMarketingEvent("primary_cta_click", {
                    placement: "home_hero",
                    destination: "/catalog",
                    label: "Start designing",
                  })
                }
              >
                <Button size="lg" className="bg-cta hover:bg-cta/90 text-cta-foreground font-semibold px-8 py-6 text-base shadow-glow">
                  Start designing
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 bg-surface-sunken">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Three simple steps to your custom phone case
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step) => (
              <div key={step.number} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cta/10 border border-cta/30 mb-6">
                  <span className="font-display font-bold text-cta text-lg">{step.number}</span>
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Models Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
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
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularModels.map((variant) => (
              <div key={variant.id}>
                <Link
                  to={`/design/${variant.id}`}
                  onClick={() =>
                    trackMarketingEvent("select_item", {
                      item_list_id: "popular_models",
                      item_list_name: "Popular models",
                      placement: "home_popular_models",
                      items: asMarketingItems(
                        [buildAnalyticsItem({ variant })].filter(Boolean),
                      ),
                    })
                  }
                >
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
              </div>
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
          <div className="text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Snapcase?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              A clear path from phone model to preview and secure checkout
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {faqs.map((faq) => (
              <div
                key={faq.title}
                className="bg-card rounded-2xl p-6 border border-border/50"
              >
                <div className="w-12 h-12 rounded-xl bg-cta/10 flex items-center justify-center mb-4">
                  <faq.icon className="w-6 h-6 text-cta" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{faq.title}</h3>
                <p className="text-sm text-muted-foreground">{faq.description}</p>
              </div>
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
              <Link to="/custom-iphone-case" className="hover:text-foreground transition-colors">iPhone Cases</Link>
              <Link to="/custom-samsung-case" className="hover:text-foreground transition-colors">Samsung Cases</Link>
              <Link to="/gifts/custom-phone-case" className="hover:text-foreground transition-colors">Gift Ideas</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © {currentYear} snapcase.ai. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
