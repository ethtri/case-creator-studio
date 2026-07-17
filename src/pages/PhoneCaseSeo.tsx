import { Fragment, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Package, Palette, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { getVariantById, phoneVariants } from "@/data/phoneVariants";
import NotFound from "@/pages/NotFound";
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";
import { trackMarketingEvent } from "@/lib/marketing";
import { asMarketingItems, buildAnalyticsItem } from "@/lib/analytics-commerce";
import { SITE_URL } from "@/data/seoRoutes";

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const PhoneCaseSeo = () => {
  const { variantSlug } = useParams();
  const variant = getVariantById(variantSlug ?? "");

  useEffect(() => {
    if (!variant) return;
    trackMarketingEvent("view_item", {
      currency: variant.currency,
      value: variant.price,
      items: asMarketingItems(
        [buildAnalyticsItem({ variant })].filter(Boolean),
      ),
    });
  }, [variant]);

  if (!variant) {
    return <NotFound />;
  }

  const related = phoneVariants
    .filter((candidate) => candidate.brand === variant.brand && candidate.id !== variant.id)
    .slice(0, 3);
  const productName = `${variant.model} Custom Phone Case`;
  const productUrl = `${SITE_URL}/phone-cases/${variant.id}`;
  const breadcrumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Phone cases", url: `${SITE_URL}/catalog` },
    { name: `${variant.model} custom case`, url: productUrl },
  ];
  const mockup = variant.brand === "Apple" ? iphoneCaseFront : samsungCaseFront;
  const designIdeas =
    variant.brand === "Apple"
      ? [
          "Use one favorite photo, initials, or a short line so the iPhone case still feels clean in daily use.",
          "If this is a gift, confirm the exact supported iPhone model before designing so the order stays tied to the selected device.",
          "For birthdays, holidays, or just-because gifts, a simple memory usually reads better than a dense collage.",
        ]
      : [
          "Start with the exact Galaxy model, then keep the artwork away from the camera area when reviewing the preview.",
          "A pet photo, travel image, name, or small phrase can make a Samsung case personal without crowding the design.",
          "For gift orders, save the phone model and design idea together so the final cart stays tied to the intended device.",
        ];

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "Product",
          productID: variant.id,
          name: productName,
          description: `Design a personalized ${variant.model} phone case with your own photo, text, or artwork.`,
          url: productUrl,
          image: new URL(mockup, `${SITE_URL}/`).href,
          brand: {
            "@type": "Brand",
            name: "Snapcase",
          },
          offers: {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: variant.currency,
            price: variant.price.toFixed(2),
            itemCondition: "https://schema.org/NewCondition",
          },
        }}
      />
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((breadcrumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: breadcrumb.name,
            item: breadcrumb.url,
          })),
        }}
      />

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
        <section className="pt-28 pb-16 bg-surface-sunken">
          <div className="container mx-auto px-6">
            <Breadcrumb className="mb-8" data-product-breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((breadcrumb, index) => {
                  const isCurrentPage = index === breadcrumbs.length - 1;

                  return (
                    <Fragment key={breadcrumb.url}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem data-breadcrumb-position={index + 1}>
                        {isCurrentPage ? (
                          <BreadcrumbPage>{breadcrumb.name}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={new URL(breadcrumb.url).pathname}>
                              {breadcrumb.name}
                            </Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>

            <div className="grid lg:grid-cols-[1fr_360px] gap-12 items-center">
              <div>
                <p className="text-sm font-semibold text-cta-emphasis mb-4">{variant.brand} custom case</p>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                  Design your own {variant.model} phone case.
                </h1>
                <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
                  Personalize a {variant.model} case with a photo, artwork, text, or gift message.
                  Preview your design before checkout and keep the order tied to the exact model.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild size="lg" className="bg-cta hover:bg-cta/90 text-cta-foreground">
                    <Link
                      to={`/design/${variant.id}`}
                      onClick={() => {
                        const items = asMarketingItems(
                          [buildAnalyticsItem({ variant })].filter(Boolean),
                        );
                        trackMarketingEvent("select_item", {
                          item_list_id: "model_seo_page",
                          item_list_name: "Model SEO page",
                          placement: "model_seo_page",
                          items,
                        });
                        trackMarketingEvent("primary_cta_click", {
                          placement: "model_seo_page",
                          destination: `/design/${variant.id}`,
                          label: "Start designing",
                        });
                      }}
                    >
                      Start designing
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link to="/catalog">
                      Change phone model
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="hidden lg:flex justify-center">
                <img
                  src={mockup}
                  alt={`${variant.model} custom phone case mockup`}
                  className="w-72 drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-6 grid md:grid-cols-3 gap-6">
            <article className="rounded-lg border border-border bg-card p-6">
              <Palette className="w-6 h-6 text-cta-emphasis mb-4" aria-hidden="true" />
              <h2 className="text-xl font-semibold mb-3">Personal design</h2>
              <p className="text-sm text-muted-foreground">
                Upload an image, add text, and make a case around a memory, pet, trip, or milestone.
                Strong designs usually focus on one idea that stays clear when the case is in someone's hand.
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-6">
              <Package className="w-6 h-6 text-cta-emphasis mb-4" aria-hidden="true" />
              <h2 className="text-xl font-semibold mb-3">Model-specific order</h2>
              <p className="text-sm text-muted-foreground">
                This page starts with the {variant.model}, so the case order stays connected to the selected phone.
                That matters when buying for someone else because device names can sound similar.
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-6">
              <ShieldCheck className="w-6 h-6 text-cta-emphasis mb-4" aria-hidden="true" />
              <h2 className="text-xl font-semibold mb-3">Preview first</h2>
              <p className="text-sm text-muted-foreground">
                Generate a preview before cart and checkout so the design can be reviewed first.
                Check text placement, photo crop, and the overall look before continuing.
              </p>
            </article>
          </div>
        </section>

        <section className="py-16 border-y border-border/60">
          <div className="container mx-auto px-6 grid lg:grid-cols-[320px_1fr] gap-10">
            <div>
              <h2 className="text-3xl font-bold mb-4">{variant.model} gift ideas</h2>
              <p className="text-muted-foreground">
                A custom phone case works best when the design is specific to the person and easy
                to recognize at a glance.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {designIdeas.map((idea) => (
                <p key={idea} className="text-sm leading-6 text-muted-foreground">
                  {idea}
                </p>
              ))}
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="py-16 bg-surface-sunken">
            <div className="container mx-auto px-6">
              <h2 className="text-3xl font-bold mb-8">More {variant.brand} custom cases</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to={`/phone-cases/${item.id}`}
                    className="rounded-lg border border-border bg-card p-5 hover:border-cta/50 transition-colors"
                  >
                    <h3 className="font-semibold mb-2">{item.model} custom case</h3>
                    <p className="text-sm text-muted-foreground">
                      Build a personalized case for this model.
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default PhoneCaseSeo;
