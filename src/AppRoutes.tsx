import { lazy, Suspense } from "react";
import { Navigate, Routes, Route, useParams } from "react-router-dom";
import {
  loadAuth,
  loadAuthCallback,
  loadCatalog,
  loadCheckout,
  loadContact,
  loadDesignEditorEDM,
  loadDesigns,
  loadIndex,
  loadKexiaozhanCheckout,
  loadNotFound,
  loadOperations,
  loadOrders,
  loadOrderSuccess,
  loadPhoneCaseSeo,
  loadPreview,
  loadPrivacy,
  loadSeoLanding,
  loadTerms,
} from "./route-loaders";

const Index = lazy(loadIndex);
const Catalog = lazy(loadCatalog);
const SeoLanding = lazy(loadSeoLanding);
const PhoneCaseSeo = lazy(loadPhoneCaseSeo);
const Preview = lazy(loadPreview);
const Checkout = lazy(loadCheckout);
const OrderSuccess = lazy(loadOrderSuccess);
const Orders = lazy(loadOrders);
const Designs = lazy(loadDesigns);
const Auth = lazy(loadAuth);
const AuthCallback = lazy(loadAuthCallback);
const Operations = lazy(loadOperations);
const KexiaozhanCheckout = lazy(loadKexiaozhanCheckout);
const Terms = lazy(loadTerms);
const Privacy = lazy(loadPrivacy);
const Contact = lazy(loadContact);
const NotFound = lazy(loadNotFound);
const DesignEditorEDM = lazy(loadDesignEditorEDM);

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
      <Route
        path="/custom-phone-case/pet-photo-phone-case"
        element={<SeoLanding />}
      />
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
