import { Link } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  Eye,
  Image,
  MessageSquareText,
  Smartphone,
  Upload,
} from "lucide-react";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { Button } from "@/components/ui/button";
import { phoneVariants } from "@/data/phoneVariants";
import { getStaticSeoPage, SITE_URL } from "@/data/seoRoutes";
import { useConsentAwareMarketingView } from "@/hooks/useConsentAwareMarketingView";
import { trackMarketingEvent } from "@/lib/marketing";
import {
  buildSeoLandingCtaPayload,
  buildSeoLandingListPayload,
  buildSeoLandingSelectionPayload,
  getSeoLandingItemListId,
  type SeoLandingCtaKind,
} from "@/lib/seo-landing-analytics";

const PAGE_PATH = "/custom-phone-case/photo-case-for-new-phone";

const faqs = [
  {
    question: "Why should I choose the exact iPhone model first?",
    answer:
      "Phone cases are model-specific, including their size and camera opening. Confirm the full model name before you begin the design.",
  },
  {
    question: "Can I add text to my photo case?",
    answer:
      "Yes. You can upload an image, add optional text, and use the preview to review the full layout before checkout.",
  },
  {
    question: "Can I preview the case before ordering?",
    answer:
      "Yes. The design flow includes a preview step before you add the custom case to your cart.",
  },
  {
    question: "What kind of photo should I start with?",
    answer:
      "Start with a clear image where the main subject is easy to see and has a little room around it for cropping.",
  },
];

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const IphonePhotoLanding = () => {
  const page = getStaticSeoPage(PAGE_PATH);
  const models = phoneVariants
    .filter((variant) => variant.brand === "Apple")
    .slice(0, 4);
  const itemListId = getSeoLandingItemListId(page);
  const stepIcons = [Smartphone, Upload, MessageSquareText, Eye];

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
    <div className="iphone-photo-landing min-h-screen bg-background text-foreground">
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
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer,
            },
          })),
        }}
      />

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#10102f]/15 bg-[#fbfaf7]/95 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link
            to="/"
            className="-ml-2 inline-flex min-h-11 items-center px-2 font-display text-xl font-bold text-[#10102f]"
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
        <section className="border-b-2 border-[#10102f] pt-16">
          <div className="grid min-h-[680px] xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.72fr)_minmax(340px,0.66fr)]">
            <div className="flex flex-col justify-center px-6 py-16 sm:px-10 lg:px-16 xl:px-12">
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-[#046a70]">
                Your photo. Your exact model.
              </p>
              <h1 className="max-w-[12ch] text-balance font-display text-4xl font-bold leading-[0.98] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                {page.headline}
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                {page.intro}
              </p>
              <div className="mt-9 grid max-w-xl grid-cols-3 gap-4 border-y border-[#10102f]/20 py-5 text-center text-xs font-semibold sm:text-sm">
                <span className="flex flex-col items-center gap-2">
                  <Camera className="size-5 text-[#046a70]" aria-hidden="true" />
                  Upload a photo
                </span>
                <span className="flex flex-col items-center gap-2 border-x border-[#10102f]/15 px-2">
                  <MessageSquareText className="size-5 text-[#046a70]" aria-hidden="true" />
                  Add optional text
                </span>
                <span className="flex flex-col items-center gap-2">
                  <Eye className="size-5 text-[#046a70]" aria-hidden="true" />
                  Preview first
                </span>
              </div>
            </div>

            <div className="min-h-[420px] border-y-2 border-[#10102f] xl:border-y-0 xl:border-l-2">
              <img
                src="/marketing/iphone-photo-landing/iphone-photo-case-hero.webp"
                width={1200}
                height={900}
                alt="Unbranded phone case with an original teal and sand abstract image"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex flex-col justify-center bg-[#10102f] px-6 py-12 text-white sm:px-10 xl:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2e92d]">
                Step 1
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Choose your iPhone
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Select the full model name shown for the phone you have.
              </p>
              <div className="mt-7 space-y-3">
                {models.map((variant, index) => (
                  <Link
                    key={variant.id}
                    to={`/phone-cases/${variant.id}`}
                    onClick={() =>
                      trackMarketingEvent(
                        "select_item",
                        buildSeoLandingSelectionPayload(page, variant),
                      )
                    }
                    className={`flex min-h-14 items-center justify-between rounded-md px-5 text-sm font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      index === 0
                        ? "bg-[#f2e92d] text-[#10102f]"
                        : "bg-white text-[#10102f]"
                    }`}
                  >
                    {variant.model}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ))}
              </div>
              <Link
                to="/catalog"
                onClick={() => trackCta("models_header")}
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
              >
                See every supported model
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="border-b-2 border-[#10102f] py-16" aria-labelledby="crop-heading">
          <div className="container mx-auto px-6">
            <div className="grid gap-10 lg:grid-cols-[300px_1fr] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#046a70]">
                  Crop it with care
                </p>
                <h2 id="crop-heading" className="mt-3 text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Leave room around what matters.
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Use a clear photo, keep the main subject away from the edges, and check the camera area in the preview.
                </p>
              </div>
              <div>
                <img
                  src="/marketing/iphone-photo-landing/photo-crop-guidance.webp"
                  width={1600}
                  height={800}
                  loading="lazy"
                  alt="Generic crop guidance showing a centered subject and a subject cut off at the edge"
                  className="aspect-[2/1] w-full rounded-lg object-cover"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Generic example shown for photo-selection guidance.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b-2 border-[#10102f]" aria-labelledby="steps-heading">
          <div className="container mx-auto px-6 py-16">
            <h2 id="steps-heading" className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              From new phone to personal case
            </h2>
            <div className="mt-10 grid border-y-2 border-[#10102f] md:grid-cols-2 lg:grid-cols-4">
              {page.sections.map((section, index) => {
                const Icon = stepIcons[index] ?? Check;
                return (
                  <article
                    key={section.title}
                    className="border-[#10102f] px-5 py-7 md:border-l md:first:border-l-0 lg:px-6"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="size-6 text-[#046a70]" aria-hidden="true" />
                      <span className="font-display text-3xl text-[#10102f]/35">{index + 1}</span>
                    </div>
                    <h3 className="mt-7 font-display text-xl font-bold">{section.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{section.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid border-b-2 border-[#10102f] lg:grid-cols-2">
          <div className="border-b-2 border-[#10102f] px-6 py-16 sm:px-10 lg:border-b-0 lg:border-r-2 lg:px-16">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#046a70]">Keep it focused</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Give the photo room to lead.</h2>
            <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
              Start with one clear image. Add a short message only when it helps the design feel more personal without crowding the subject.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ["One focused photo", "Choose a subject that is easy to recognize at phone-case size."],
                ["One short message", "Keep optional text brief and review its placement in the preview."],
              ].map(([title, body]) => (
                <article key={title} className="border-2 border-[#10102f] p-5">
                  <h3 className="font-display text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-center bg-[#066d71] px-6 py-16 text-white sm:px-10 lg:px-16">
            <Smartphone className="size-9" aria-hidden="true" />
            <h2 className="mt-6 text-balance font-display text-3xl font-bold tracking-tight md:text-4xl">
              Confirm the model before you upload.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-white/75">
              The selected model controls the case size and camera opening. Check the full iPhone model name before starting the design.
            </p>
          </div>
        </section>

        <section className="py-16" aria-labelledby="iphone-photo-faq-heading">
          <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[320px_1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#046a70]">Before checkout</p>
              <h2 id="iphone-photo-faq-heading" className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
                iPhone photo case questions
              </h2>
            </div>
            <div className="divide-y-2 divide-[#10102f] border-y-2 border-[#10102f]">
              {faqs.map((faq) => (
                <article key={faq.question} className="py-6">
                  <h3 className="font-display text-lg font-bold">{faq.question}</h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y-2 border-[#10102f] bg-[#f1edcf] py-16 text-center">
          <div className="container mx-auto px-6">
            <Image className="mx-auto size-8 text-[#046a70]" aria-hidden="true" />
            <h2 className="mx-auto mt-5 max-w-2xl text-balance font-display text-3xl font-bold tracking-tight md:text-5xl">
              Ready to make your new iPhone feel personal?
            </h2>
            <Button asChild size="lg" className="mt-8 min-h-12 rounded-md bg-[#10102f] px-6 text-white shadow-medium hover:bg-[#10102f]/90">
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
          <Link to="/" className="font-display font-bold text-foreground">Snapcase</Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label="iPhone photo case page links">
            <Link to="/custom-phone-case" className="hover:text-foreground">Custom phone cases</Link>
            <Link to="/gifts/custom-phone-case" className="hover:text-foreground">Gift ideas</Link>
            <Link to="/custom-phone-case/pet-photo-phone-case" className="hover:text-foreground">Pet photo cases</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default IphonePhotoLanding;
