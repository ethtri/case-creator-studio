import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Gift, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { getStaticSeoPage, SITE_URL } from "@/data/seoRoutes";
import { phoneVariants } from "@/data/phoneVariants";
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";

const JsonLd = ({ value }: { value: Record<string, unknown> }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value) }}
  />
);

const SeoLanding = () => {
  const location = useLocation();
  const page = getStaticSeoPage(location.pathname);
  const models = page.featuredBrand
    ? phoneVariants.filter((variant) => variant.brand === page.featuredBrand).slice(0, 6)
    : phoneVariants.slice(0, 6);

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

      <main>
        <section className="pt-28 pb-16 bg-surface-sunken">
          <div className="container mx-auto px-6 grid lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-cta mb-4">{page.eyebrow}</p>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                {page.headline}
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
                {page.intro}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/catalog">
                  <Button size="lg" className="bg-cta hover:bg-cta/90 text-cta-foreground">
                    {page.cta}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <Link to="/gifts/custom-phone-case">
                  <Button size="lg" variant="outline">
                    Gift ideas
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative min-h-[420px] hidden lg:block">
              <img
                src={iphoneCaseFront}
                alt="iPhone case model illustration"
                className="absolute left-6 top-0 w-64 drop-shadow-2xl"
              />
              <img
                src={samsungCaseFront}
                alt="Samsung case model illustration"
                className="absolute right-0 bottom-0 w-60 rotate-3 drop-shadow-2xl"
              />
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-6 grid md:grid-cols-3 gap-6">
            {page.sections.map((section, index) => {
              const icons = [Gift, Smartphone, ShieldCheck];
              const Icon = icons[index] ?? Gift;
              return (
                <article key={section.title} className="border border-border rounded-lg p-6 bg-card">
                  <Icon className="w-6 h-6 text-cta mb-4" />
                  <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                  <p className="text-sm text-muted-foreground">{section.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="py-16 border-y border-border/60">
          <div className="container mx-auto px-6 grid lg:grid-cols-[320px_1fr] gap-10">
            <div>
              <h2 className="text-3xl font-bold mb-4">Gift-buyer notes</h2>
              <p className="text-muted-foreground">
                Keep the design personal, readable, and tied to the recipient's exact phone model.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {page.giftAngles.map((angle) => (
                <p key={angle} className="text-sm leading-6 text-muted-foreground">
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
                <h2 className="text-3xl font-bold mb-2">Popular starting points</h2>
                <p className="text-muted-foreground">
                  Choose the model first, then personalize the case.
                </p>
              </div>
              <Link to="/catalog" className="hidden md:inline-flex text-sm text-cta">
                Browse all cases
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map((variant) => (
                <Link
                  key={variant.id}
                  to={`/phone-cases/${variant.id}`}
                  className="rounded-lg border border-border bg-card p-5 hover:border-cta/50 transition-colors"
                >
                  <p className="text-xs text-muted-foreground mb-1">{variant.brand}</p>
                  <h3 className="font-semibold mb-2">{variant.model} custom case</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Personalize this model with a photo, design, or message.
                  </p>
                  <span className="text-sm font-medium text-cta">View details</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SeoLanding;
