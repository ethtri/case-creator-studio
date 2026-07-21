import { Link, useLocation } from "react-router-dom";
import {
  Camera,
  Check,
  ChevronRight,
  Gift,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { getStaticSeoPage, SITE_URL } from "@/data/seoRoutes";
import { phoneVariants } from "@/data/phoneVariants";
import { useConsentAwareMarketingView } from "@/hooks/useConsentAwareMarketingView";
import { trackMarketingEvent } from "@/lib/marketing";
import {
  buildSeoLandingCtaPayload,
  buildSeoLandingListPayload,
  buildSeoLandingSelectionPayload,
  getSeoLandingItemListId,
  type SeoLandingCtaKind,
} from "@/lib/seo-landing-analytics";
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const giftFaqs = [
  {
    question: "What should I confirm before designing a gift case?",
    answer:
      "Confirm the recipient's exact iPhone or Samsung model. Phone cases are model-specific, including the size and camera opening.",
  },
  {
    question: "Can I use both a photo and a message?",
    answer:
      "Yes. You can upload an image, add text, and use the preview to check the layout before checkout.",
  },
  {
    question: "Can I review the case before ordering?",
    answer:
      "Yes. The design flow includes a preview step before you add the custom case to your cart.",
  },
];

const SeoLanding = () => {
  const location = useLocation();
  const page = getStaticSeoPage(location.pathname);
  const isGiftLanding = page.path === "/gifts/custom-phone-case";
  const models = isGiftLanding
    ? [
        ...phoneVariants
          .filter((variant) => variant.brand === "Apple")
          .slice(0, 3),
        ...phoneVariants
          .filter((variant) => variant.brand === "Samsung")
          .slice(0, 3),
      ]
    : page.featuredBrand
      ? phoneVariants
          .filter((variant) => variant.brand === page.featuredBrand)
          .slice(0, 6)
      : phoneVariants.slice(0, 6);
  const itemListId = getSeoLandingItemListId(page);

  useConsentAwareMarketingView({
    eventName: "view_item_list",
    contractId: itemListId,
    payload: buildSeoLandingListPayload(page, models),
  });

  const trackCta = (kind: SeoLandingCtaKind) =>
    trackMarketingEvent(
      "primary_cta_click",
      buildSeoLandingCtaPayload(page, kind),
    );

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        value={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: page.headline,
          description: page.intro,
          url: `${SITE_URL}${page.path}`,
        }}
      />
      {isGiftLanding && (
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: giftFaqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }}
        />
      )}

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2"
          >
            <span className="font-display font-bold text-xl text-foreground">
              Snapcase
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden bg-surface-sunken pb-16 pt-28">
          {isGiftLanding && (
            <div
              className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_15%_20%,hsl(var(--cta)/0.13),transparent_34%),radial-gradient(circle_at_85%_75%,hsl(var(--accent)/0.11),transparent_30%)]"
              aria-hidden="true"
            />
          )}
          <div className="container relative mx-auto grid items-center gap-12 px-6 lg:grid-cols-[1fr_420px]">
            <div className="max-w-3xl">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-cta-emphasis">
                {page.eyebrow}
              </p>
              <h1 className="mb-6 max-w-4xl text-balance text-4xl font-bold tracking-tight md:text-6xl">
                {page.headline}
              </h1>
              <p className="mb-8 max-w-2xl text-lg leading-8 text-muted-foreground">
                {page.intro}
              </p>
              {isGiftLanding && (
                <ul
                  className="mb-8 grid max-w-2xl gap-3 text-sm sm:grid-cols-3"
                  aria-label="Gift design steps"
                >
                  {[
                    "Choose their model",
                    "Add a photo or text",
                    "Check the preview",
                  ].map((step) => (
                    <li
                      key={step}
                      className="flex items-center gap-2 text-foreground"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cta/10 text-cta-emphasis">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="bg-cta text-cta-foreground shadow-medium hover:bg-cta/90"
                >
                  <Link to="/catalog" onClick={() => trackCta("hero_primary")}>
                    {page.cta}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
                {!isGiftLanding && (
                  <Button asChild size="lg" variant="outline">
                    <Link
                      to="/gifts/custom-phone-case"
                      onClick={() => trackCta("hero_secondary")}
                    >
                      Gift ideas
                    </Link>
                  </Button>
                )}
              </div>
              {isGiftLanding && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No gift design yet? Start with one photo, one memory, or one
                  short message.
                </p>
              )}
            </div>

            <div className="relative hidden min-h-[440px] lg:block">
              <img
                src={iphoneCaseFront}
                width={1600}
                height={800}
                alt="iPhone case model illustration"
                className="absolute left-6 top-0 w-64 -rotate-3 drop-shadow-2xl"
              />
              <img
                src={samsungCaseFront}
                width={1600}
                height={800}
                alt="Samsung case model illustration"
                className="absolute right-0 top-24 w-60 rotate-3 drop-shadow-2xl"
              />
              {isGiftLanding && (
                <div className="absolute bottom-0 left-0 right-3 rounded-2xl border border-border/80 bg-card/95 p-5 shadow-strong backdrop-blur">
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cta/10 text-cta-emphasis">
                      <Smartphone className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">
                        The detail that matters most
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Ask for the exact phone model before you design. “iPhone
                        17” and “iPhone 17 Pro” need different cases.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="py-16"
          id={isGiftLanding ? "gift-guide" : undefined}
        >
          <div className="container mx-auto px-6">
            {isGiftLanding && (
              <div className="mb-10 max-w-2xl">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cta-emphasis">
                  A simple place to start
                </p>
                <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
                  Pick one detail they will recognize immediately.
                </h2>
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-3">
              {page.sections.map((section, index) => {
                const icons = isGiftLanding
                  ? [Camera, MessageSquareText, ShieldCheck]
                  : [Gift, Smartphone, ShieldCheck];
                const Icon = icons[index] ?? Gift;
                return (
                  <article
                    key={section.title}
                    className="rounded-2xl border border-border bg-card p-6 shadow-soft"
                  >
                    <span className="mb-5 grid size-11 place-items-center rounded-xl bg-cta/10 text-cta-emphasis">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="text-xl font-semibold mb-3">
                      {section.title}
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {section.body}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {isGiftLanding && (
          <section className="border-y border-border/60 bg-foreground py-12 text-background">
            <div className="container mx-auto grid gap-8 px-6 md:grid-cols-[220px_1fr] md:items-center">
              <div className="flex items-center gap-4 md:block">
                <span className="grid size-12 place-items-center rounded-2xl bg-background/10">
                  <Smartphone className="size-6" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-background/70 md:mt-4">
                  Before you begin
                </p>
              </div>
              <div>
                <h2 className="text-balance text-3xl font-bold tracking-tight">
                  Confirm the exact phone model—not just “iPhone” or “Samsung.”
                </h2>
                <p className="mt-4 max-w-3xl leading-7 text-background/75">
                  Check the recipient's phone settings or ask them for the full
                  model name. The model determines the case size and camera
                  opening, so this quick check prevents the most avoidable gift
                  mistake.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="py-16 border-b border-border/60">
          <div className="container mx-auto px-6 grid lg:grid-cols-[320px_1fr] gap-10">
            <div>
              <h2 className="text-3xl font-bold mb-4">
                {isGiftLanding
                  ? "Make it personal, not complicated"
                  : "Gift-buyer notes"}
              </h2>
              <p className="text-muted-foreground">
                Keep the design personal, readable, and tied to the recipient's
                exact phone model.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {page.giftAngles.map((angle) => (
                <p
                  key={angle}
                  className="text-sm leading-6 text-muted-foreground"
                >
                  {angle}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-surface-sunken">
          <div className="container mx-auto px-6">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-bold mb-2">
                  Popular starting points
                </h2>
                <p className="text-muted-foreground">
                  Choose the model first, then personalize the case.
                </p>
              </div>
              <Link
                to="/catalog"
                onClick={() => trackCta("models_header")}
                className="hidden min-h-11 items-center text-sm text-cta-emphasis md:inline-flex"
              >
                Browse all cases
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map((variant) => (
                <Link
                  key={variant.id}
                  to={`/phone-cases/${variant.id}`}
                  onClick={() =>
                    trackMarketingEvent(
                      "select_item",
                      buildSeoLandingSelectionPayload(page, variant),
                    )
                  }
                  className="rounded-lg border border-border bg-card p-5 hover:border-cta/50 transition-colors"
                >
                  <p className="text-xs text-muted-foreground mb-1">
                    {variant.brand}
                  </p>
                  <h3 className="font-semibold mb-2">
                    {variant.model} custom case
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Personalize this model with a photo, design, or message.
                  </p>
                  <span className="text-sm font-medium text-cta-emphasis">
                    View details
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {isGiftLanding && (
          <section className="py-16" aria-labelledby="gift-faq-heading">
            <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[320px_1fr]">
              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cta-emphasis">
                  Before checkout
                </p>
                <h2
                  id="gift-faq-heading"
                  className="text-3xl font-bold tracking-tight"
                >
                  Gift case questions
                </h2>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {giftFaqs.map((faq) => (
                  <article key={faq.question} className="py-6">
                    <h3 className="font-semibold text-foreground">
                      {faq.question}
                    </h3>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {faq.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default SeoLanding;
