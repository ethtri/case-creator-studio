import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Eye,
  Gift,
  Image,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Upload,
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

const petPhotoFaqs = [
  {
    question: "Can I add my pet's name?",
    answer:
      "Yes. Upload a pet photo, add a short name or message, and use the preview to check the full layout before checkout.",
  },
  {
    question: "Can I preview the design before ordering?",
    answer:
      "Yes. The design flow includes a preview before you add the custom case to your cart.",
  },
  {
    question: "Which phone models can I choose?",
    answer:
      "Snapcase supports selected iPhone and Samsung models. Choose the exact model first so the case size and camera opening match the device.",
  },
];

const SeoLanding = () => {
  const location = useLocation();
  const page = getStaticSeoPage(location.pathname);
  const isGiftLanding = page.path === "/gifts/custom-phone-case";
  const isPetLanding = page.path === "/custom-phone-case/pet-photo-phone-case";
  const models =
    isGiftLanding || isPetLanding
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

  if (isPetLanding) {
    const stepIcons = [Smartphone, Upload, MessageSquareText, Eye];

    return (
      <div className="pet-photo-landing min-h-screen bg-background text-foreground">
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: page.headline,
            description: page.intro,
            url: `${SITE_URL}${page.path}`,
          }}
        />
        <JsonLd
          value={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: petPhotoFaqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }}
        />

        <nav className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="container mx-auto flex h-16 items-center justify-between px-6">
            <Link
              to="/"
              className="-ml-2 inline-flex min-h-11 items-center px-2 font-display text-xl font-bold text-foreground"
            >
              Snapcase
            </Link>
            <div className="flex items-center gap-3">
              <CartSheet />
              <SiteMenu />
            </div>
          </div>
        </nav>

        <main>
          <section className="overflow-hidden border-b border-border/50 bg-[#fafafa] pt-16">
            <div className="container mx-auto grid min-h-[680px] items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)] lg:py-20">
              <div className="max-w-3xl">
                <h1 className="max-w-[13ch] text-balance font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-7xl">
                  {page.headline}
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
                  {page.intro}
                </p>
                <Button
                  asChild
                  size="lg"
                  className="mt-9 min-h-12 rounded-md bg-cta px-6 text-cta-foreground shadow-medium hover:bg-cta/90"
                >
                  <Link to="/catalog" onClick={() => trackCta("hero_primary")}>
                    {page.cta}
                    <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <div className="relative mx-auto flex min-h-[480px] w-full max-w-[520px] items-center justify-center overflow-hidden rounded-[2rem] bg-[#edf0e8] px-8 pt-10 shadow-soft sm:min-h-[560px]">
                <div
                  className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.95),transparent_42%)]"
                  aria-hidden="true"
                />
                <img
                  src="/marketing/pet-photo-landing/pet-photo-case-hero.webp"
                  width={427}
                  height={900}
                  alt="Illustrated golden retriever design on a phone case"
                  className="relative z-10 h-[470px] w-auto max-w-full object-contain drop-shadow-2xl sm:h-[540px]"
                />
              </div>
            </div>
          </section>

          <section
            className="border-b border-border/60 py-20"
            aria-labelledby="pet-steps-heading"
          >
            <div className="container mx-auto px-6">
              <h2
                id="pet-steps-heading"
                className="font-display text-3xl font-bold tracking-tight md:text-4xl"
              >
                How it works
              </h2>
              <div className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-0">
                {page.sections.map((section, index) => {
                  const Icon = stepIcons[index] ?? Check;
                  return (
                    <article
                      key={section.title}
                      className="relative border-border lg:border-l lg:px-8 lg:first:border-l-0 lg:first:pl-0"
                    >
                      <div className="mb-7 flex items-center justify-between">
                        <span className="grid size-12 place-items-center rounded-full border border-border bg-card text-cta-emphasis shadow-soft">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span className="font-display text-sm font-semibold text-muted-foreground">
                          0{index + 1}
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-semibold">
                        {section.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {section.body}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="py-20" aria-labelledby="photo-guidance-heading">
            <div className="container mx-auto px-6">
              <div className="grid gap-10 lg:grid-cols-[360px_1fr] lg:items-end">
                <div>
                  <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cta-emphasis">
                    Photo guidance
                  </p>
                  <h2
                    id="photo-guidance-heading"
                    className="text-balance font-display text-3xl font-bold tracking-tight md:text-4xl"
                  >
                    Pick a photo that reads clearly.
                  </h2>
                </div>
                <ul
                  className="grid gap-4 sm:grid-cols-3"
                  aria-label="Pet photo tips"
                >
                  {[
                    "Use a well-lit image",
                    "Keep the face in focus",
                    "Leave space around the subject",
                  ].map((tip) => (
                    <li
                      key={tip}
                      className="flex items-start gap-3 border-t border-border pt-4 text-sm font-medium"
                    >
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-cta-emphasis"
                        aria-hidden="true"
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 overflow-hidden rounded-xl bg-surface-sunken">
                <img
                  src="/marketing/pet-photo-landing/clear-pet-photo-examples.webp"
                  width={1500}
                  height={750}
                  loading="lazy"
                  alt="Three generic pet photo examples showing clear, well-lit portraits"
                  className="aspect-[2/1] w-full object-cover"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Generic examples shown for photo-selection guidance.
              </p>
            </div>
          </section>

          <section className="bg-foreground py-16 text-background">
            <div className="container mx-auto grid gap-8 px-6 md:grid-cols-[180px_1fr] md:items-center">
              <div>
                <Smartphone className="size-9" aria-hidden="true" />
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-background/65">
                  Before you design
                </p>
              </div>
              <div>
                <h2 className="text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Confirm the exact phone model first.
                </h2>
                <p className="mt-4 max-w-3xl leading-7 text-background/70">
                  The model determines the case size and camera opening. Choose
                  the supported iPhone or Samsung model before you upload the
                  photo.
                </p>
              </div>
            </div>
          </section>

          <section
            className="border-b border-border/60 py-20"
            aria-labelledby="pet-ideas-heading"
          >
            <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-[360px_1fr]">
              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cta-emphasis">
                  Keep it focused
                </p>
                <h2
                  id="pet-ideas-heading"
                  className="text-balance font-display text-3xl font-bold tracking-tight md:text-4xl"
                >
                  Simple pet case ideas
                </h2>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {[
                  "One favorite portrait",
                  "A name or short message",
                  "A clean background color",
                ].map((idea, index) => (
                  <article
                    key={idea}
                    className="grid gap-3 py-7 sm:grid-cols-[64px_1fr]"
                  >
                    <span className="font-display text-sm font-semibold text-muted-foreground">
                      0{index + 1}
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-semibold">
                        {idea}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {page.giftAngles[index]}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            className="bg-surface-sunken py-20"
            aria-labelledby="pet-models-heading"
          >
            <div className="container mx-auto px-6">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <h2
                    id="pet-models-heading"
                    className="font-display text-3xl font-bold tracking-tight md:text-4xl"
                  >
                    Popular starting points
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    Choose the exact model, then add your pet photo.
                  </p>
                </div>
                <Link
                  to="/catalog"
                  onClick={() => trackCta("models_header")}
                  className="hidden min-h-11 items-center gap-2 text-sm font-semibold text-cta-emphasis sm:inline-flex"
                >
                  See all supported models
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-10 grid border-y border-border sm:grid-cols-2 lg:grid-cols-3">
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
                    className="group border-b border-border p-6 transition-colors hover:bg-card sm:border-r lg:[&:nth-child(3n)]:border-r-0"
                  >
                    <p className="text-xs text-muted-foreground">
                      {variant.brand}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold">
                      {variant.model} custom case
                    </h3>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-cta-emphasis">
                      View details
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                to="/catalog"
                onClick={() => trackCta("models_header")}
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cta-emphasis sm:hidden"
              >
                See all supported models
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="py-20" aria-labelledby="pet-faq-heading">
            <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[360px_1fr]">
              <div>
                <h2
                  id="pet-faq-heading"
                  className="text-balance font-display text-3xl font-bold tracking-tight md:text-4xl"
                >
                  Pet photo case questions
                </h2>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {petPhotoFaqs.map((faq) => (
                  <article key={faq.question} className="py-7">
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      {faq.question}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {faq.answer}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-y border-border/60 bg-[#edf0e8] py-20 text-center">
            <div className="container mx-auto px-6">
              <Image
                className="mx-auto size-8 text-cta-emphasis"
                aria-hidden="true"
              />
              <h2 className="mx-auto mt-5 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight md:text-5xl">
                Ready to start with one favorite photo?
              </h2>
              <Button
                asChild
                size="lg"
                className="mt-8 min-h-12 rounded-md bg-cta px-6 text-cta-foreground shadow-medium hover:bg-cta/90"
              >
                <Link to="/catalog" onClick={() => trackCta("hero_primary")}>
                  Start designing
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <footer className="py-10">
          <div className="container mx-auto flex flex-col gap-6 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <Link to="/" className="font-display font-bold text-foreground">
              Snapcase
            </Link>
            <nav
              className="flex flex-wrap gap-x-6 gap-y-3"
              aria-label="Pet case page links"
            >
              <Link to="/custom-phone-case" className="hover:text-foreground">
                Custom phone cases
              </Link>
              <Link
                to="/gifts/custom-phone-case"
                className="hover:text-foreground"
              >
                Gift ideas
              </Link>
              <Link to="/catalog" className="hover:text-foreground">
                Supported models
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    );
  }

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
