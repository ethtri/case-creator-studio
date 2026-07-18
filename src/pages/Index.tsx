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
import {
  getSharedCatalogPriceContext,
  HOME_PRIMARY_CTA,
  HOME_STARTING_MODELS,
} from "@/lib/entry-page-contract";

const steps = [
  {
    number: "01",
    title: "Choose your model",
    description: "Pick from supported iPhone and Samsung models.",
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

const startingModels = phoneVariants.slice(0, 4);
const homePriceContext = getSharedCatalogPriceContext(phoneVariants);

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
          <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2">
            <span className="font-display font-bold text-xl text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main>
      {/* Hero Section */}
      <section
        className="relative flex min-h-[700px] items-end overflow-hidden bg-[#08050f] text-[#fff9fc] md:min-h-screen md:items-center"
        data-home-design-bench="true"
        data-hero-theme="fixed-dark"
      >
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
              data-hero-artwork="true"
              width="1024"
              height="1024"
              {...{ fetchpriority: "high" }}
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover object-center opacity-90"
            />
          </picture>
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#08050f]/15 via-[#08050f]/60 to-[#08050f] md:hidden"
            data-hero-mobile-scrim="true"
          />
          <div
            className="absolute inset-0 hidden bg-[linear-gradient(90deg,#08050f_0%,rgba(8,5,15,0.96)_27%,rgba(8,5,15,0.52)_43%,rgba(8,5,15,0.08)_66%,rgba(8,5,15,0.02)_100%)] md:block"
            data-hero-desktop-scrim="true"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#08050f]/90 via-transparent to-[#08050f]/45 md:bg-[linear-gradient(180deg,rgba(8,5,15,0.24)_0%,transparent_22%,transparent_78%,rgba(8,5,15,0.32)_100%)]" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-4 bottom-5 top-20 rounded-[1.75rem] border border-white/10 sm:inset-x-6 md:inset-x-8 md:bottom-8 md:top-24"
            aria-hidden="true"
          />
        </div>

        <div className="container relative z-10 mx-auto px-6 pb-14 pt-32 md:pb-20 md:pt-28">
          <div className="max-w-2xl">
            <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#f7a6d2]">
              <span className="h-px w-8 bg-[#f04b9b]" aria-hidden="true" />
              The Snapcase design bench
            </p>
            <h1 className="mb-6 font-display text-5xl font-bold tracking-tight text-[#fff9fc] md:text-7xl lg:text-8xl">
              Print your
              <br />
              story.
            </h1>

            <p className="mb-8 max-w-md text-lg text-[#ddd5df] md:text-xl">
              Choose your phone, create the design, and review a preview before checkout.
            </p>

            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="bg-cta px-8 py-6 text-base font-semibold text-cta-foreground shadow-glow hover:bg-cta/90 active:scale-100 active:bg-cta"
              >
                <Link
                  to={HOME_PRIMARY_CTA.destination}
                  data-home-primary-cta="true"
                  onClick={() =>
                    trackMarketingEvent("primary_cta_click", {
                      placement: HOME_PRIMARY_CTA.placement,
                      destination: HOME_PRIMARY_CTA.destination,
                      label: HOME_PRIMARY_CTA.label,
                    })
                  }
                >
                  {HOME_PRIMARY_CTA.label}
                  <ChevronRight className="w-5 h-5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
              {homePriceContext ? (
                <p
                  className="rounded-full border border-white/20 bg-black/25 px-4 py-2 text-sm font-semibold text-[#fff9fc] backdrop-blur-sm"
                  data-home-price-context="true"
                >
                  {homePriceContext}
                </p>
              ) : null}
            </div>
            <div
              className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#bdb2c2]"
              aria-label="Design flow: choose model, create, preview"
            >
              <span><span className="text-[#f7a6d2]">01</span> Choose model</span>
              <span><span className="text-[#f7a6d2]">02</span> Create</span>
              <span><span className="text-[#f7a6d2]">03</span> Preview</span>
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
                  <span className="font-display font-bold text-cta-emphasis text-lg" aria-hidden="true">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground mb-3">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Starting Models Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
                Choose a starting model
              </h2>
              <p className="text-muted-foreground">
                Four supported Apple models to begin with, or browse the full catalog.
              </p>
            </div>
            <Button asChild variant="ghost" className="hidden text-muted-foreground hover:text-foreground md:inline-flex">
              <Link to="/catalog">
                View all
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {startingModels.map((variant) => (
              <div key={variant.id}>
                <Link
                  to={`/design/${variant.id}`}
                  data-home-starting-model={variant.id}
                  aria-label={`Start designing for ${variant.model}`}
                  onClick={() =>
                    trackMarketingEvent("select_item", {
                      currency: variant.currency,
                      item_list_id: HOME_STARTING_MODELS.itemListId,
                      item_list_name: HOME_STARTING_MODELS.itemListName,
                      placement: HOME_STARTING_MODELS.placement,
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
                      <span className="text-cta-emphasis font-semibold">${variant.price}</span>
                      <span className="text-xs text-muted-foreground group-hover:text-accent-emphasis transition-colors">
                        Design now →
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center md:hidden">
            <Button asChild variant="outline" className="border-border text-foreground">
              <Link to="/catalog">
                View all models
                <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />
              </Link>
            </Button>
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
                  <faq.icon className="w-6 h-6 text-cta-emphasis" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{faq.title}</h3>
                <p className="text-sm text-muted-foreground">{faq.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </main>

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
