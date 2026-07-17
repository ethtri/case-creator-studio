export const loadIndex = () => import("./pages/Index");
export const loadCatalog = () => import("./pages/Catalog");
export const loadSeoLanding = () => import("./pages/SeoLanding");
export const loadPhoneCaseSeo = () => import("./pages/PhoneCaseSeo");
export const loadPreview = () => import("./pages/Preview");
export const loadCheckout = () => import("./pages/Checkout");
export const loadOrderSuccess = () => import("./pages/OrderSuccess");
export const loadOrders = () => import("./pages/Orders");
export const loadDesigns = () => import("./pages/Designs");
export const loadAuth = () => import("./pages/Auth");
export const loadAuthCallback = () => import("./pages/AuthCallback");
export const loadOperations = () => import("./pages/Operations");
export const loadKexiaozhanCheckout = () => import("./pages/KexiaozhanCheckout");
export const loadTerms = () => import("./pages/Terms");
export const loadPrivacy = () => import("./pages/Privacy");
export const loadContact = () => import("./pages/Contact");
export const loadNotFound = () => import("./pages/NotFound");

export const loadDesignEditorEDM = async () => {
  const [editorModule, fontModule] = await Promise.all([
    import("./pages/DesignEditorEDM"),
    import("./lib/editor-fonts"),
  ]);

  fontModule.loadEditorFonts();
  return editorModule;
};

const seoLandingPaths = new Set([
  "/custom-phone-case",
  "/custom-iphone-case",
  "/custom-samsung-case",
  "/gifts/custom-phone-case",
]);

/**
 * Warm the initial route chunk before hydration begins. The custom static
 * prerenderer resolves lazy routes on the server, so the browser must resolve
 * the matching chunk before providers can publish client-only state updates.
 */
export const preloadInitialRoute = (pathname: string): Promise<unknown> => {
  const routePath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (routePath === "/") return loadIndex();
  if (routePath === "/catalog") return loadCatalog();
  if (seoLandingPaths.has(routePath)) return loadSeoLanding();
  if (routePath.startsWith("/phone-cases/")) return loadPhoneCaseSeo();
  if (routePath.startsWith("/design/") || routePath.startsWith("/design-edm/")) {
    return loadDesignEditorEDM();
  }
  if (routePath.startsWith("/preview/")) return loadPreview();
  if (routePath === "/checkout" || routePath.startsWith("/checkout/")) {
    return loadCheckout();
  }
  if (routePath === "/kexiaozhan/checkout") return loadKexiaozhanCheckout();
  if (routePath === "/order-success") return loadOrderSuccess();
  if (routePath === "/orders") return loadOrders();
  if (routePath === "/operations") return loadOperations();
  if (routePath === "/designs") return loadDesigns();
  if (routePath === "/auth/callback") return loadAuthCallback();
  if (routePath === "/auth") return loadAuth();
  if (routePath === "/terms") return loadTerms();
  if (routePath === "/privacy") return loadPrivacy();
  if (routePath === "/contact") return loadContact();
  return loadNotFound();
};
