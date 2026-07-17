import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { CartProvider } from "./contexts/CartContext";
import { AuthProvider } from "./contexts/AuthContext";
import type { ReactNode } from "react";
import AppRoutes from "./AppRoutes";
import { MarketingRuntime } from "./components/MarketingRuntime";
import { AnalyticsConsentBanner } from "./components/AnalyticsConsentBanner";
import { SeoRuntime } from "./components/SeoRuntime";

const queryClient = new QueryClient();

export const AppShell = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
          </TooltipProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

const App = () => (
  <AppShell>
    <BrowserRouter>
      <SeoRuntime />
      <MarketingRuntime />
      <AppRoutes />
      <AnalyticsConsentBanner />
    </BrowserRouter>
  </AppShell>
);

export default App;
