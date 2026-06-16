import { Navigate, Routes, Route, useParams } from "react-router-dom";
import Index from "./pages/Index";
import Catalog from "./pages/Catalog";
import DesignEditorEDM from "./pages/DesignEditorEDM";
import Preview from "./pages/Preview";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import Orders from "./pages/Orders";
import Designs from "./pages/Designs";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Contact from "./pages/Contact";
import SeoLanding from "./pages/SeoLanding";
import PhoneCaseSeo from "./pages/PhoneCaseSeo";
import Operations from "./pages/Operations";
import KexiaozhanCheckout from "./pages/KexiaozhanCheckout";

const LegacyCanvasRedirect = () => {
  const { variantId } = useParams();
  return (
    <Navigate to={variantId ? `/design/${variantId}` : "/catalog"} replace />
  );
};

const AppRoutes = () => (
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
);

export default AppRoutes;
