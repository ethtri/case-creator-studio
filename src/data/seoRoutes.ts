import { phoneVariants } from "@/data/phoneVariants";
import iphoneCaseFront from "@/assets/mockups/iphone-case-front.png";
import samsungCaseFront from "@/assets/mockups/samsung-case-front.png";
import { normalizeRoutePath } from "@/lib/route-path";

export type SeoRoute = {
  path: string;
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  robots: string;
  changefreq: string;
  priority: string;
};

export type StaticSeoPage = {
  path: string;
  eyebrow: string;
  headline: string;
  intro: string;
  cta: string;
  featuredBrand?: string;
  sections: {
    title: string;
    body: string;
  }[];
  giftAngles: string[];
};

export const SITE_URL = "https://www.snapcase.ai";
export const OG_IMAGE = `${SITE_URL}/og-image.png`;

const toAbsoluteAssetUrl = (assetUrl: string) => new URL(assetUrl, `${SITE_URL}/`).href;
const IPHONE_IMAGE = toAbsoluteAssetUrl(iphoneCaseFront);
const SAMSUNG_IMAGE = toAbsoluteAssetUrl(samsungCaseFront);

const makeRoute = (
  path: string,
  title: string,
  description: string,
  priority = "0.7",
  ogImage = OG_IMAGE
): SeoRoute => {
  const canonical = `${SITE_URL}${path}`;

  return {
    path,
    title,
    description,
    canonical,
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonical,
    ogImage,
    twitterTitle: title,
    twitterDescription: description,
    twitterImage: ogImage,
    robots: "index,follow",
    changefreq: "weekly",
    priority,
  };
};

const baseSeoRoutes = [
  makeRoute(
    "/",
    "Snapcase | Design Custom Phone Cases",
    "Choose an iPhone or Samsung model, create a custom phone case, and review your preview before secure checkout.",
    "1.0"
  ),
  makeRoute(
    "/catalog",
    "Phone Case Catalog | Snapcase",
    "Browse iPhone and Samsung phone cases to start your custom Snapcase design.",
    "0.8"
  ),
];

export const staticSeoPages: StaticSeoPage[] = [
  {
    path: "/custom-phone-case",
    eyebrow: "Custom Phone Cases",
    headline: "Design a personalized phone case that feels like a real gift.",
    intro:
      "Start with an iPhone or Samsung model, add a photo or message, preview the case, and check out when it is ready.",
    cta: "Start your custom case",
    sections: [
      {
        title: "Made for everyday gifting",
        body:
          "A custom phone case is personal without being hard to size. Choose the device first, then build around a favorite photo, trip, pet, inside joke, or milestone.",
      },
      {
        title: "Preview before checkout",
        body:
          "Snapcase generates a product preview before you add the design to your cart, so the gift can be reviewed before payment.",
      },
      {
        title: "Built around current devices",
        body:
          "The catalog includes supported iPhone and Samsung Galaxy models, with checkout and shipping details confirmed before purchase.",
      },
    ],
    giftAngles: [
      "For a birthday gift, use one strong photo and a short line that feels personal instead of trying to fit every memory on the case.",
      "For a holiday gift, start with the recipient's phone model, then choose a design direction around family, travel, pets, or a favorite shared place.",
      "For a last-mile gift decision, keep the case useful: clear text, centered artwork, and a preview that is easy to review before checkout.",
    ],
  },
  {
    path: "/custom-iphone-case",
    eyebrow: "Custom iPhone Cases",
    headline: "Create a custom iPhone case from a photo, design, or message.",
    intro:
      "Pick the iPhone model, personalize the case in the editor, and review a preview before checkout.",
    cta: "Design an iPhone case",
    featuredBrand: "Apple",
    sections: [
      {
        title: "Personal without guessing sizes",
        body:
          "Choose the exact iPhone model first, then add a design that fits the person receiving it.",
      },
      {
        title: "Good for birthdays and holidays",
        body:
          "Use a photo, name, phrase, pet, trip memory, or small collage to make a gift that stays useful every day.",
      },
      {
        title: "Saved designs for later",
        body:
          "Create an account to save designs, come back later, and track orders from one place.",
      },
    ],
    giftAngles: [
      "For newer iPhone models, choose the model first so the design and order stay tied to the selected device.",
      "A clean photo, initials, a phrase, or a small collage can make an iPhone case feel personal without making the design crowded.",
      "If you are buying for someone else, save the phone model and gift idea before you start designing so checkout stays focused.",
    ],
  },
  {
    path: "/custom-samsung-case",
    eyebrow: "Custom Samsung Cases",
    headline: "Make a personalized Samsung Galaxy case in minutes.",
    intro:
      "Choose a supported Galaxy model, design the case, preview it, and check out securely.",
    cta: "Design a Samsung case",
    featuredBrand: "Samsung",
    sections: [
      {
        title: "Designed around Galaxy models",
        body:
          "Start with the exact supported Galaxy device so the design and order stay tied to the model selected.",
      },
      {
        title: "Simple gift workflow",
        body:
          "Upload a photo or add text, review the case preview, and keep the cart focused on the selected design.",
      },
      {
        title: "Secure checkout",
        body:
          "Payments run through Stripe, and shipping details are collected during checkout after the custom case preview is ready.",
      },
    ],
    giftAngles: [
      "Samsung Galaxy models vary by size and camera layout, so the best gift workflow starts by selecting the exact supported device.",
      "A simple design usually works best on a Galaxy case: one image, a name, a date, or a short message that still reads at arm's length.",
      "Use the preview step to check alignment before cart, especially when the design includes faces, text, or artwork near the camera area.",
    ],
  },
  {
    path: "/gifts/custom-phone-case",
    eyebrow: "Custom Phone Case Gifts",
    headline: "A useful custom gift for birthdays, holidays, and just-because moments.",
    intro:
      "Turn a favorite memory into a phone case that is personal, practical, and easy to order.",
    cta: "Create a gift case",
    sections: [
      {
        title: "Gift ideas that work",
        body:
          "Try a pet photo, travel memory, wedding snapshot, team color, family collage, or short message that means something to the recipient.",
      },
      {
        title: "A clear path from idea to checkout",
        body:
          "Choose the phone model, design the case, generate the preview, and add it to the cart only when it is ready.",
      },
      {
        title: "Personalized without extra coordination",
        body:
          "Because the case is tied to a phone model, it is easier to personalize than apparel and easier to use than a keepsake that sits on a shelf.",
      },
    ],
    giftAngles: [
      "For partners, friends, or family, turn one meaningful detail into the design: a pet, favorite trip, inside joke, initials, or a small date.",
      "For group gifting, pick a design theme first, then ask only for the phone model so the person receiving it does not have to manage the order.",
      "For practical gifting, a phone case works because it is used every day and can still carry a personal memory without needing extra shelf space.",
    ],
  },
];

const staticSeoRoutes = staticSeoPages.map((page) =>
  makeRoute(
    page.path,
    `${page.eyebrow} | Snapcase`,
    page.intro,
    page.path === "/custom-phone-case" ? "0.9" : "0.8",
    page.featuredBrand === "Apple"
      ? IPHONE_IMAGE
      : page.featuredBrand === "Samsung"
        ? SAMSUNG_IMAGE
        : OG_IMAGE
  )
);

const productSeoRoutes = phoneVariants.map((variant) =>
  makeRoute(
    `/phone-cases/${variant.id}`,
    `${variant.model} Custom Phone Case | Snapcase`,
    `Design a personalized ${variant.model} phone case with your own photo, text, or artwork.`,
    "0.6",
    variant.brand === "Apple" ? IPHONE_IMAGE : SAMSUNG_IMAGE
  )
);

export const seoRoutes: SeoRoute[] = [
  ...baseSeoRoutes,
  ...staticSeoRoutes,
  ...productSeoRoutes,
];

export const getStaticSeoPage = (path: string) =>
  staticSeoPages.find((page) => page.path === normalizeRoutePath(path)) ?? staticSeoPages[0];

export const getSeoRouteByPath = (path: string) =>
  seoRoutes.find((route) => route.path === normalizeRoutePath(path));
