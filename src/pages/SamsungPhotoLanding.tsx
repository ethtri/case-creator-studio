import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Camera,
  Check,
  Crop,
  Eye,
  Focus,
  Image,
  MessageSquareText,
  Smartphone,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
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
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const SamsungPhotoLanding = () => {
  const location = useLocation();
  const page = getStaticSeoPage(location.pathname);
  const models = phoneVariants.filter((variant) => variant.brand === "Samsung");
  const itemListId = getSeoLandingItemListId(page);
  const supportedModelNames = models.map((variant) => variant.model).join(", ");
  const faqs = [
    {
      question: "Which Samsung Galaxy models can I choose?",
      answer: `The current Snapcase catalog supports ${supportedModelNames}. Choose the full model name before opening the editor.`,
    },
    {
      question: "How should I crop a photo for a Galaxy case?",
      answer:
        "Use a clear image, leave some room around the main subject, and keep faces, text, and other important details away from the edges and camera area.",
    },
    {
      question: "Can I check the layout before ordering?",
      answer:
        "Yes. The design flow includes a preview so you can review the photo, spacing, and camera area before adding the case to your cart.",
    },
  ];

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
    <div className="samsung-photo-landing min-h-screen bg-background text-foreground">
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

      <nav className="fixed inset-x-0 top-0 z-50 border-b-2 border-foreground/90 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link
            to="/"
            className="-ml-2 inline-flex min-h-11 items-center px-2 font-display text-xl font-bold"
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
        <section className="overflow-hidden border-b-2 border-foreground pt-16">
          <div className="grid min-h-[680px] lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="flex items-center px-6 py-16 sm:px-10 lg:px-[max(3rem,calc((100vw-1400px)/2+2rem))]">
              <div className="max-w-3xl">
                <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-cta-emphasis">
                  {page.eyebrow}
                </p>
                <h1 className="max-w-[15ch] text-balance font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-7xl">
                  {page.headline}
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
                  {page.intro}
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="min-h-12 rounded-md bg-cta px-6 text-cta-foreground shadow-medium hover:bg-cta/90"
                  >
                    <a
                      href="#galaxy-models"
                      onClick={() => trackCta("hero_primary")}
                    >
                      {page.cta}
                      <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link
                      to="/gifts/custom-phone-case"
                      onClick={() => trackCta("hero_secondary")}
                    >
                      Photo gift ideas
                    </Link>
                  </Button>
                </div>
                <ul
                  className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold"
                  aria-label="Supported Samsung Galaxy models"
                >
                  {models.map((variant) => (
                    <li key={variant.id} className="flex items-center gap-2">
                      <Check
                        className="size-4 text-cta-emphasis"
                        aria-hidden="true"
                      />
                      {variant.model}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <figure className="relative min-h-[520px] overflow-hidden border-t-2 border-foreground bg-[#d8eddd] lg:min-h-full lg:border-l-2 lg:border-t-0">
              <div
                className="absolute inset-0 opacity-75 [background:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.95),transparent_34%),linear-gradient(135deg,transparent_55%,rgba(21,88,74,0.14)_55%)]"
                aria-hidden="true"
              />
              <div className="absolute left-6 top-6 z-10 max-w-48 border-2 border-foreground bg-background px-4 py-3 text-xs font-bold uppercase leading-5 tracking-[0.12em] sm:left-10 sm:top-10">
                Check the camera area in your preview
              </div>
              <img
                src={samsungCaseFront}
                width={1024}
                height={1536}
                alt="Generic phone case reference showing the camera area"
                className="absolute bottom-[-14%] left-1/2 h-[86%] w-auto max-w-none -translate-x-1/2 object-contain drop-shadow-2xl"
              />
              <figcaption className="absolute bottom-5 left-5 right-5 border-2 border-foreground bg-background/95 px-4 py-3 text-xs leading-5 text-muted-foreground backdrop-blur sm:left-auto sm:max-w-xs">
                Generic case reference shown for layout guidance. Choose the
                exact supported Galaxy model below.
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className="border-b-2 border-foreground bg-foreground py-9 text-background"
          aria-labelledby="before-upload-heading"
        >
          <div className="container mx-auto grid gap-6 px-6 lg:grid-cols-[240px_1fr] lg:items-center">
            <h2
              id="before-upload-heading"
              className="font-display text-2xl font-bold tracking-tight"
            >
              Before you upload
            </h2>
            <ul className="grid gap-5 text-sm sm:grid-cols-3">
              {[
                "Confirm the full Galaxy model",
                "Choose one clear photo",
                "Leave room near the camera",
              ].map((tip, index) => (
                <li
                  key={tip}
                  className="flex items-center gap-3 border-background/30 sm:border-l sm:pl-5"
                >
                  <span className="font-display text-xs text-background/55">
                    0{index + 1}
                  </span>
                  <span className="font-semibold">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="galaxy-models"
          className="scroll-mt-16 border-b-2 border-foreground py-20"
          aria-labelledby="galaxy-models-heading"
        >
          <div className="container mx-auto px-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cta-emphasis">
                  Model first
                </p>
                <h2
                  id="galaxy-models-heading"
                  className="mt-3 text-balance font-display text-3xl font-bold tracking-tight md:text-5xl"
                >
                  Choose the Galaxy you actually have.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
                Camera layouts and case dimensions differ by model. Compare the
                full name of the phone with one of these current catalog options
                before starting the design.
              </p>
            </div>

            <div className="mt-12 grid border-2 border-foreground md:grid-cols-3">
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
                  className="group flex min-h-72 flex-col border-foreground p-6 transition-colors hover:bg-[#d8eddd] md:border-l-2 md:first:border-l-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Current catalog model
                    </span>
                    <span className="grid grid-cols-2 gap-1" aria-hidden="true">
                      {[0, 1, 2, 3].map((dot) => (
                        <span
                          key={dot}
                          className={`block rounded-full border-2 border-foreground ${
                            dot === 3 && index > 0 ? "size-2" : "size-3"
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                  <span className="mt-10 font-display text-5xl text-muted-foreground">
                    0{index + 1}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-bold">
                    {variant.model}
                  </h3>
                  <span className="mt-auto inline-flex min-h-11 items-center gap-2 pt-7 text-sm font-bold text-cta-emphasis">
                    Select this model
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-8 grid gap-4 border-l-4 border-cta bg-surface-sunken px-6 py-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <Smartphone
                className="size-6 text-cta-emphasis"
                aria-hidden="true"
              />
              <div>
                <h3 className="font-display text-lg font-bold">
                  Not sure which model it is?
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Check the phone settings or ask the owner for the full model
                  name. Do not choose from appearance alone.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-b-2 border-foreground bg-surface-sunken py-20"
          aria-labelledby="photo-guidance-heading"
        >
          <div className="container mx-auto px-6">
            <div className="grid gap-12 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cta-emphasis">
                  Photo guidance
                </p>
                <h2
                  id="photo-guidance-heading"
                  className="mt-3 text-balance font-display text-3xl font-bold tracking-tight md:text-5xl"
                >
                  Give the important part of the photo room.
                </h2>
                <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
                  A flexible crop starts with a clear subject and extra space
                  around it. The preview is where you check how that photo sits
                  beside the camera area and outer edges.
                </p>
              </div>

              <div className="grid border-2 border-foreground bg-card sm:grid-cols-3">
                {[
                  {
                    icon: Focus,
                    title: "Keep the subject clear",
                    body: "Choose an image where the face or main detail is easy to recognize.",
                  },
                  {
                    icon: Crop,
                    title: "Leave edge room",
                    body: "Avoid a crop that already cuts tightly around the important detail.",
                  },
                  {
                    icon: Camera,
                    title: "Check the camera area",
                    body: "Use the preview to review anything placed near the upper corner.",
                  },
                ].map(({ icon: Icon, title, body }) => (
                  <article
                    key={title}
                    className="border-foreground p-6 sm:border-l-2 sm:first:border-l-0"
                  >
                    <Icon
                      className="size-6 text-cta-emphasis"
                      aria-hidden="true"
                    />
                    <h3 className="mt-8 font-display text-xl font-bold">
                      {title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {body}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-12 grid overflow-hidden border-2 border-foreground bg-card lg:grid-cols-[0.9fr_1.1fr]">
              <div
                className="relative grid min-h-96 place-items-center overflow-hidden bg-[#d8eddd] p-10"
                role="img"
                aria-label="Crop diagram showing the main subject centered away from the camera corner and outer edges"
              >
                <div
                  className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(21,20,45,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(21,20,45,0.12)_1px,transparent_1px)] [background-size:36px_36px]"
                  aria-hidden="true"
                />
                <div
                  className="relative h-80 w-52 rounded-[2.25rem] border-[6px] border-foreground bg-[#fff9e8] shadow-medium"
                  aria-hidden="true"
                >
                  <span className="absolute left-4 top-5 grid grid-cols-2 gap-1.5">
                    <span className="size-5 rounded-full bg-foreground" />
                    <span className="size-5 rounded-full bg-foreground" />
                    <span className="size-5 rounded-full bg-foreground" />
                  </span>
                  <span className="absolute inset-8 top-20 rounded-[1.5rem] border-2 border-dashed border-cta" />
                  <span className="absolute left-1/2 top-[46%] size-24 -translate-x-1/2 rounded-full bg-[#ff8f70]" />
                  <span className="absolute left-1/2 top-[68%] h-12 w-32 -translate-x-1/2 rounded-t-full bg-[#f4ca4f]" />
                </div>
              </div>
              <div className="flex flex-col justify-center border-t-2 border-foreground px-6 py-12 sm:px-10 lg:border-l-2 lg:border-t-0">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cta-emphasis">
                  A practical crop check
                </p>
                <h3 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight">
                  Keep faces, names, and dates out of the squeeze zones.
                </h3>
                <ul className="mt-7 space-y-4 text-sm leading-6 text-muted-foreground">
                  {[
                    "Leave a little space between the subject and every outer edge.",
                    "Move important details away from the camera corner.",
                    "Read short text at preview size before continuing to cart.",
                  ].map((tip) => (
                    <li key={tip} className="flex items-start gap-3">
                      <Check
                        className="mt-1 size-4 shrink-0 text-cta-emphasis"
                        aria-hidden="true"
                      />
                      {tip}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs text-muted-foreground">
                  Generic diagram shown for crop guidance; the selected model
                  controls the final preview.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-b-2 border-foreground py-20"
          aria-labelledby="samsung-steps-heading"
        >
          <div className="container mx-auto px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cta-emphasis">
                  From model to preview
                </p>
                <h2
                  id="samsung-steps-heading"
                  className="mt-3 font-display text-3xl font-bold tracking-tight md:text-5xl"
                >
                  Four checks, in order.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Choose the device before you make design decisions, then use the
                preview as the last visual check.
              </p>
            </div>

            <div className="mt-12 grid border-y-2 border-foreground md:grid-cols-2 lg:grid-cols-4">
              {page.sections.map((section, index) => {
                const Icon = [Smartphone, Upload, Crop, Eye][index] ?? Check;
                return (
                  <article
                    key={section.title}
                    className="border-foreground px-6 py-8 md:border-l-2 md:first:border-l-0"
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className="size-6 text-cta-emphasis"
                        aria-hidden="true"
                      />
                      <span className="font-display text-3xl text-muted-foreground">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-8 font-display text-xl font-bold">
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

        <section
          className="border-b-2 border-foreground py-20"
          aria-labelledby="samsung-faq-heading"
        >
          <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[320px_1fr]">
            <div>
              <MessageSquareText
                className="size-7 text-cta-emphasis"
                aria-hidden="true"
              />
              <h2
                id="samsung-faq-heading"
                className="mt-5 text-balance font-display text-3xl font-bold tracking-tight md:text-4xl"
              >
                Samsung photo case questions
              </h2>
            </div>
            <div className="divide-y-2 divide-foreground border-y-2 border-foreground">
              {faqs.map((faq) => (
                <article key={faq.question} className="py-7">
                  <h3 className="font-display text-lg font-bold">
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

        <section className="bg-[#d8eddd] py-20 text-center">
          <div className="container mx-auto px-6">
            <Image
              className="mx-auto size-8 text-cta-emphasis"
              aria-hidden="true"
            />
            <h2 className="mx-auto mt-5 max-w-3xl text-balance font-display text-3xl font-bold tracking-tight md:text-5xl">
              Start with the model. Finish with the preview.
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">
              Browse every supported case if you need to compare Samsung and
              iPhone options before designing.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 min-h-12 rounded-md bg-cta px-6 text-cta-foreground shadow-medium hover:bg-cta/90"
            >
              <Link to="/catalog" onClick={() => trackCta("models_header")}>
                Browse all supported cases
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-foreground py-10">
        <div className="container mx-auto flex flex-col gap-6 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="font-display font-bold text-foreground">
            Snapcase
          </Link>
          <nav
            className="flex flex-wrap gap-x-6 gap-y-3"
            aria-label="Samsung photo case page links"
          >
            <Link to="/custom-phone-case" className="hover:text-foreground">
              Custom phone cases
            </Link>
            <Link
              to="/custom-phone-case/pet-photo-phone-case"
              className="hover:text-foreground"
            >
              Pet photo cases
            </Link>
            <Link
              to="/gifts/custom-phone-case"
              className="hover:text-foreground"
            >
              Gift ideas
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default SamsungPhotoLanding;
