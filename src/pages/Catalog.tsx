import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatProductPrice,
  phoneVariants,
  getPhoneModels,
  getBrands,
} from "@/data/phoneVariants";
import { ChevronRight, Filter, Search } from "lucide-react";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { useConsentAwareMarketingView } from "@/hooks/useConsentAwareMarketingView";
import { trackMarketingEvent } from "@/lib/marketing";
import { asMarketingItems, buildAnalyticsItem, buildAnalyticsItems } from "@/lib/analytics-commerce";

const catalogViewPayload = {
  currency: "USD",
  item_list_id: "phone_models",
  item_list_name: "Phone models",
  items: asMarketingItems(
    buildAnalyticsItems(phoneVariants.map((variant) => ({ variant }))),
  ),
};

const Catalog = () => {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const brands = getBrands();
  const phoneModels = getPhoneModels();
  const currentYear = new Date().getFullYear();

  useConsentAwareMarketingView({
    eventName: "view_item_list",
    contractId: "phone_models",
    payload: catalogViewPayload,
  });

  const filteredModels = useMemo(() => {
    const entries = Array.from(phoneModels.entries());
    let filtered = entries;

    if (selectedBrand) {
      filtered = filtered.filter(([key]) => key.startsWith(selectedBrand));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered
        .map(([key, variants]) => [key, variants.filter(v => 
          v.model.toLowerCase().includes(query) || 
          v.brand.toLowerCase().includes(query)
        )] as [string, typeof variants])
        .filter(([, variants]) => variants.length > 0);
    }

    return filtered;
  }, [phoneModels, selectedBrand, searchQuery]);
  const visibleVariants = filteredModels.flatMap(([, variants]) => variants);
  const trackCatalogSelection = (
    variant: (typeof phoneVariants)[number],
    placement: string,
  ) =>
    trackMarketingEvent("select_item", {
      item_list_id: "phone_models",
      item_list_name: "Phone models",
      placement,
      items: asMarketingItems(
        [buildAnalyticsItem({ variant })].filter(Boolean),
      ),
    });

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
            <SiteMenu showBrowse={false} />
          </div>
        </div>
      </nav>

      <main>
      {/* Header */}
      <section className="pt-28 pb-12">
        <div className="container mx-auto px-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Choose Your Phone
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Select your phone model to start designing your custom case
            </p>
          </div>

          {/* Search & Brand Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-8">
            <div className="relative w-full sm:w-64">
              <Label htmlFor="phone-search" className="sr-only">Search phone models</Label>
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="phone-search"
                type="text"
                placeholder="Search phones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by brand">
              <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Button
                variant={selectedBrand === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBrand(null)}
                aria-pressed={selectedBrand === null}
              >
                All
              </Button>
              {brands.map((brand) => (
                <Button
                  key={brand}
                  variant={selectedBrand === brand ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBrand(brand)}
                  aria-pressed={selectedBrand === brand}
                >
                  {brand}
                </Button>
              ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {visibleVariants.length} phone {visibleVariants.length === 1 ? "model" : "models"} shown.
            </p>
          </div>
        </div>
      </section>

      {/* Phone Models Grid */}
      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleVariants.map((variant) => (
                <article
                  key={variant.id}
                  className="group relative flex h-full flex-col rounded-xl border border-border/50 bg-card p-4 transition-all duration-200 hover:border-accent/50 hover:shadow-medium"
                >
                  {/* Phone Icon */}
                  <div className="mb-3 flex justify-center" aria-hidden="true">
                    <div className="flex h-20 w-10 flex-col items-center rounded-lg border-2 border-border/50 bg-muted pt-1">
                      <div className="h-1 w-4 rounded-full bg-foreground/20" />
                    </div>
                  </div>

                  {/* Model name & Price */}
                  <div className="flex flex-1 flex-col text-center">
                    <p className="mb-0.5 text-xs text-muted-foreground">
                      {variant.brand}
                    </p>
                    <h2 className="mb-2 text-sm font-medium leading-tight">
                      {variant.model}
                    </h2>
                    <p
                      className="mb-3 text-sm font-semibold text-accent-emphasis"
                      data-catalog-offer={variant.id}
                      data-price={variant.price.toFixed(2)}
                      data-currency={variant.currency}
                    >
                      {formatProductPrice(variant)}
                    </p>

                    <div className="mt-auto flex flex-col gap-2">
                      <Link
                        to={`/phone-cases/${variant.id}`}
                        onClick={() =>
                          trackCatalogSelection(variant, "catalog_view_details")
                        }
                        className="inline-flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-medium text-cta-emphasis underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        View details
                        <span className="sr-only"> for {variant.model}</span>
                      </Link>
                      <Button
                        asChild
                        size="sm"
                        className="min-h-11 w-full bg-cta px-2 text-cta-foreground hover:bg-cta/90"
                      >
                        <Link
                          to={`/design/${variant.id}`}
                          onClick={() =>
                            trackCatalogSelection(
                              variant,
                              "catalog_start_design",
                            )
                          }
                        >
                          Start designing
                          <span className="sr-only"> for {variant.model}</span>
                          <ChevronRight
                            className="ml-1 h-4 w-4"
                            aria-hidden="true"
                          />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {/* Hover ring */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-accent ring-opacity-0 transition-all group-hover:ring-opacity-100"
                    aria-hidden="true"
                  />
                </article>
            ))}
          </div>
          {visibleVariants.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">
              No phone models match your search. Try another model or brand.
            </p>
          )}
        </div>
      </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
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

export default Catalog;
