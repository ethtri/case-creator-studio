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
import { getCatalogResultCopy } from "@/lib/entry-page-contract";

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
      const query = searchQuery.trim().toLowerCase();
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
      currency: variant.currency,
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
          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center">
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
            <p
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-border/70 bg-card px-4 text-sm font-medium text-foreground shadow-soft sm:w-auto"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-catalog-result-count="true"
            >
              {getCatalogResultCopy(visibleVariants.length)}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Device imagery identifies compatibility. Phone not included.
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
                  className="group relative flex h-full flex-col rounded-xl border border-border/70 bg-card p-3 shadow-soft transition-[border-color,box-shadow,background-color] duration-200 hover:border-cta/60 hover:shadow-medium focus-within:border-cta focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background sm:p-4"
                  data-catalog-card={variant.id}
                >
                  <figure className="relative mb-4 overflow-hidden rounded-lg border border-border/60 bg-[radial-gradient(circle_at_50%_36%,hsl(var(--card))_0%,hsl(var(--muted))_100%)]">
                    <div className="relative aspect-[41/45] w-full">
                      {variant.imageRole === "open-reference" && (
                        <>
                          <img
                            src={variant.imageUrl}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-xl saturate-75"
                          />
                          <div
                            className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/20 to-background/55"
                            aria-hidden="true"
                          />
                        </>
                      )}
                      <img
                        src={variant.imageUrl}
                        alt={`${variant.model} device reference for case compatibility; phone not included`}
                        width={variant.imageWidth ?? 410}
                        height={variant.imageHeight ?? 450}
                        loading="lazy"
                        decoding="async"
                        className={`relative z-10 h-full w-full transition-transform duration-300 group-hover:scale-[1.025] ${
                          variant.imageRole === "device-reference"
                            ? "object-contain"
                            : "object-contain p-3 drop-shadow-[0_14px_24px_rgba(0,0,0,0.35)]"
                        }`}
                        data-catalog-image={variant.id}
                      />
                    </div>
                  </figure>

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
                        className="catalog-details-action inline-flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-medium text-cta-emphasis underline-offset-4 transition-colors hover:bg-muted/60 hover:underline"
                      >
                        View details
                        <span className="sr-only"> for {variant.model}</span>
                      </Link>
                      <Button
                        asChild
                        size="sm"
                        className="catalog-design-action min-h-11 w-full bg-cta px-2 text-cta-foreground hover:bg-cta/90 active:scale-100"
                      >
                        <Link
                          to={`/design/${variant.id}`}
                          data-model-selection-cue="true"
                          onClick={() =>
                            trackCatalogSelection(
                              variant,
                              "catalog_start_design",
                            )
                          }
                        >
                          Choose model
                          <span className="sr-only"> for {variant.model}</span>
                          <ChevronRight
                            className="ml-1 h-4 w-4"
                            aria-hidden="true"
                          />
                        </Link>
                      </Button>
                    </div>
                  </div>
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
