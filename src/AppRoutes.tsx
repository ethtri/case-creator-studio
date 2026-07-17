import { lazy, Suspense } from "react";
import { Navigate, Routes, Route, useParams } from "react-router-dom";

const Index = lazy(() => import("./pages/Index"));
const Catalog = lazy(() => import("./pages/Catalog"));
const SeoLanding = lazy(() => import("./pages/SeoLanding"));
const PhoneCaseSeo = lazy(() => import("./pages/PhoneCaseSeo"));
const Preview = lazy(() => import("./pages/Preview"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const Orders = lazy(() => import("./pages/Orders"));
const Designs = lazy(() => import("./pages/Designs"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Operations = lazy(() => import("./pages/Operations"));
const KexiaozhanCheckout = lazy(() => import("./pages/KexiaozhanCheckout"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Contact = lazy(() => import("./pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DesignEditorEDM = lazy(async () => {
  const [editorModule, fontModule] = await Promise.all([
    import("./pages/DesignEditorEDM"),
    import("./lib/editor-fonts"),
  ]);

  fontModule.loadEditorFonts();
  return editorModule;
});

const LegacyCanvasRedirect = () => {
  const { variantId } = useParams();
  return (
    <Navigate to={variantId ? `/design/${variantId}` : "/catalog"} replace />
  );
};

const RouteFallback = () => (
  <div
    className="min-h-screen bg-background"
    role="status"
    aria-label="Loading page"
  />
);

const AppRoutes = () => (
  <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/custom-phone-case" element={<SeoLanding />} />
      <Route path="/custom-iphone-case" element={<SeoLanding />} />
      <Route path="/custom-samsung-case" element={<SeoLanding />} />
      <Route path="/gifts/custom-phone-case" element={<SeoLanding />} />
      <Route path="/phone-cases/:variantSlug" element={<PhoneCaseSeo />} />
      <Route path="/design/:variantId" element={<DesignEditorEDM />} />
      <Route path="/design-edm/:variantId" element={<DesignEditorEDM />} />
      <Route
        path="/design-canvas/:variantId"
        element={<LegacyCanvasRedirect />}
      />
      <Route path="/preview/:variantId" element={<Preview />} />
      <Route path="/checkout/:variantId" element={<Checkout />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/kexiaozhan/checkout" element={<KexiaozhanCheckout />} />
      <Route path="/order-success" element={<OrderSuccess />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/operations" element={<Operations />} />
      <Route path="/designs" element={<Designs />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/contact" element={<Contact />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
