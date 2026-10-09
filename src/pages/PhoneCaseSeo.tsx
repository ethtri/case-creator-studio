import { Fragment } from "react";
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
import {
  formatProductPrice,
  getRelatedVariants,
  getVariantById,
} from "@/data/phoneVariants";
import NotFound from "@/pages/NotFound";
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";
import { useConsentAwareMarketingView } from "@/hooks/useConsentAwareMarketingView";
import { trackMarketingEvent } from "@/lib/marketing";
import { asMarketingItems, buildAnalyticsItem } from "@/lib/analytics-commerce";
import { SITE_URL } from "@/data/seoRoutes";
import { SNAPCASE_EMAILS } from "@/lib/email-identities";

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const productInspirations = [
  {
    title: "Their favorite face",
    description: "Start with one clear pet photo and let the expression carry the design.",
    image: "/marketing/pinterest/pet-case-product-pin.png",
    alt: "AI-generated product concept showing a golden retriever photo on a custom phone case",
  },
  {
    title: "A family favorite",
    description: "Choose a shared moment that still feels good every time it appears.",
    image: "/marketing/pinterest/family-case-product-pin.png",
    alt: "AI-generated product concept showing a family sunset photo on a custom phone case",
  },
  {
    title: "The trip you replay",
    description: "Turn one unmistakable place into a case that keeps the memory close.",
    image: "/marketing/pinterest/vacation-case-product-pin.png",
    alt: "AI-generated product concept showing a coastal vacation photo on a custom phone case",
  },
] as const;

const PhoneCaseSeo = () => {
  const { variantSlug } = useParams();
  const variant = getVariantById(variantSlug ?? "");

  useConsentAwareMarketingView({
    enabled: Boolean(variant),
    eventName: "view_item",
    contractId: variant?.id ?? "missing_product",
    payload: variant
      ? {
          currency: variant.currency,
          value: variant.price,
          items: asMarketingItems(
            [buildAnalyticsItem({ variant })].filter(Boolean),
          ),
        }
      : {},
  });

  if (!variant) {
    return <NotFound />;
  }

  const related = getRelatedVariants(variant);
  const productName = `${variant.model} Custom Phone Case`;
  const productUrl = `${SITE_URL}/phone-cases/${variant.id}`;
  const visiblePrice = formatProductPrice(variant);
  const breadcrumbs = [
    { name: "Home", url: `${SITE_URL}/` },
    { name: "Phone cases", url: `${SITE_URL}/catalog` },
    { name: `${variant.model} custom case`, url: productUrl },
  ];
  const usesDeviceReference = variant.id === "iphone-17";
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
          // A compatibility photo is not a photograph of the case being sold.
          ...(usesDeviceReference ? {} : { image: new URL(mockup, `${SITE_URL}/`).href }),
          brand: {
            "@type": "Brand",
            name: "Snapcase",
          },
          offers: {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: variant.currency,
            price: variant.price.toFixed(2),
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
                <div
                  className="mb-6 inline-flex min-w-48 items-end justify-between gap-6 rounded-lg border border-border bg-card px-4 py-3 shadow-soft"
                  data-product-offer="true"
                  data-product-id={variant.id}
                  data-price={variant.price.toFixed(2)}
                  data-currency={variant.currency}
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Custom case price
                    </p>
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {visiblePrice}
                    </p>
                  </div>
                </div>
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
                {variant.brand === "Apple" && (
                  <section
                    aria-label="Purchase details"
                    className="mt-5 space-y-2 text-sm text-muted-foreground"
                    data-product-purchase-facts="true"
                  >
                    <p>Preview your design before adding it to your cart.</p>
                    <p>Shipping is shown before payment. Production time varies.</p>
                    <div className="flex flex-wrap gap-x-5">
                      <a
                        href={`mailto:${SNAPCASE_EMAILS.support}`}
                        className="inline-flex min-h-11 items-center font-medium text-cta-emphasis underline underline-offset-4"
                      >
                        {SNAPCASE_EMAILS.support}
                      </a>
                      <Link
                        to="/terms"
                        className="inline-flex min-h-11 items-center font-medium text-cta-emphasis underline underline-offset-4"
                      >
                        Terms
                      </Link>
                    </div>
                  </section>
                )}
              </div>

              {usesDeviceReference ? (
                <figure className="mx-auto w-full max-w-sm">
                  <img
                    src={variant.imageUrl}
                    width={variant.imageWidth}
                    height={variant.imageHeight}
                    alt={`${variant.model} device reference for case compatibility; phone not included`}
                    data-product-device-reference="true"
                    className="mx-auto max-h-96 w-64 rounded-xl object-contain"
                  />
                  <figcaption className="mx-auto mt-4 max-w-xs text-center text-sm leading-6 text-muted-foreground">
                    iPhone 17 device reference. Phone not included. Preview your custom case in the designer.
                  </figcaption>
                </figure>
              ) : (
                <div className="hidden lg:flex justify-center">
                  <img
                    src={mockup}
                    width={1600}
                    height={800}
                    alt={`Digital illustration of a ${variant.model} custom phone case mockup`}
                    data-product-mockup="true"
                    className="w-72 drop-shadow-2xl"
                  />
                </div>
              )}
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

        {variant.brand === "Apple" && (
          <section
            className="overflow-hidden border-y border-white/10 bg-[#071a35] py-20 text-[#fff7e9]"
            data-product-inspiration="true"
          >
            <div className="container mx-auto px-6">
              <div className="grid gap-10 lg:grid-cols-[0.8fr_2.2fr] lg:gap-14">
                <div className="max-w-md lg:sticky lg:top-28 lg:self-start">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[#ff8b70]">
                    Make it unmistakably yours
                  </p>
                  <h2 className="font-display text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl">
                    Three photos. Three completely different cases.
                  </h2>
                  <p className="mt-6 text-base leading-7 text-[#d8e4f3]">
                    Pet, family, or favorite trip—begin with the memory you want to see every day,
                    then shape it for your {variant.model} in the editor.
                  </p>
                  <p className="mt-5 border-l-2 border-[#ff8b70] pl-4 text-sm leading-6 text-[#aebfd3]">
                    AI-generated product concepts. Case silhouette and camera area are inspiration,
                    not an exact-model proof. Your preview is the exact design review step before checkout.
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-3 lg:gap-6">
                  {productInspirations.map((inspiration, index) => (
                    <Link
                      key={inspiration.image}
                      to={`/design/${variant.id}`}
                      className={`group relative overflow-hidden rounded-[1.6rem] border border-white/15 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-2 hover:border-[#ff8b70]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8b70] focus-visible:ring-offset-4 focus-visible:ring-offset-[#071a35] ${
                        index === 1 ? "lg:translate-y-8 lg:hover:translate-y-6" : ""
                      }`}
                      onClick={() => {
                        const items = asMarketingItems(
                          [buildAnalyticsItem({ variant })].filter(Boolean),
                        );
                        trackMarketingEvent("select_item", {
                          item_list_id: "model_product_inspiration",
                          item_list_name: "Product inspiration",
                          placement: "model_product_inspiration",
                          items,
                        });
                        trackMarketingEvent("primary_cta_click", {
                          placement: "model_product_inspiration",
                          destination: `/design/${variant.id}`,
                          label: inspiration.title,
                        });
                      }}
                    >
                      <div className="aspect-[2/3] overflow-hidden">
                        <img
                          src={inspiration.image}
                          width={1000}
                          height={1500}
                          alt={inspiration.alt}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071a35] via-[#071a35]/95 to-transparent px-5 pb-5 pt-20">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#ff8b70]">
                          Product concept
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-[#fff7e9]">
                          {inspiration.title}
                        </h3>
                        <p className="mt-2 text-sm leading-5 text-[#d8e4f3]">
                          {inspiration.description}
                        </p>
                        <span className="mt-4 inline-flex items-center text-sm font-semibold text-white">
                          Try this idea on {variant.model}
                          <ChevronRight
                            className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

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
