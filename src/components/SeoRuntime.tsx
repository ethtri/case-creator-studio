import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { getSeoRouteByPath } from "@/data/seoRoutes";

const NOINDEX_TITLES: [RegExp, string][] = [
  [/^\/design(?:-edm|-canvas)?\//, "Design Your Case | Snapcase"],
  [/^\/preview\//, "Preview Your Case | Snapcase"],
  [/^\/checkout(?:\/|$)/, "Checkout | Snapcase"],
  [/^\/order-success$/, "Order Confirmed | Snapcase"],
  [/^\/orders$/, "My Orders | Snapcase"],
  [/^\/designs$/, "My Designs | Snapcase"],
  [/^\/auth(?:\/|$)/, "Sign In | Snapcase"],
  [/^\/terms$/, "Terms of Service | Snapcase"],
  [/^\/privacy$/, "Privacy Policy | Snapcase"],
  [/^\/contact$/, "Contact Snapcase | Snapcase"],
  [/^\/operations$/, "Operations | Snapcase"],
  [/^\/kexiaozhan\/checkout$/, "Secure Checkout | Snapcase"],
];

const getNoindexTitle = (pathname: string) =>
  NOINDEX_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Page Not Found | Snapcase";

const upsertMeta = (attribute: "name" | "property", key: string, value: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
};

const upsertCanonical = (href: string) => {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = href;
};

const removeIndexableMetadata = () => {
  document.head.querySelector('link[rel="canonical"]')?.remove();
  document.head
    .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
    .forEach((element) => element.remove());
};

export const SeoRuntime = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const route = getSeoRouteByPath(pathname);

    if (!route) {
      document.title = getNoindexTitle(pathname);
      upsertMeta("name", "description", "Secure Snapcase design, checkout, and account experience.");
      upsertMeta("name", "robots", "noindex,nofollow");
      removeIndexableMetadata();
      return;
    }

    document.title = route.title;
    upsertMeta("name", "description", route.description);
    upsertMeta("name", "robots", route.robots);
    upsertCanonical(route.canonical);
    upsertMeta("property", "og:title", route.ogTitle);
    upsertMeta("property", "og:description", route.ogDescription);
    upsertMeta("property", "og:site_name", "Snapcase");
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:url", route.ogUrl);
    upsertMeta("property", "og:image", route.ogImage);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:site", "@snapcase");
    upsertMeta("name", "twitter:title", route.twitterTitle);
    upsertMeta("name", "twitter:description", route.twitterDescription);
    upsertMeta("name", "twitter:image", route.twitterImage);
  }, [pathname]);

  return null;
};
