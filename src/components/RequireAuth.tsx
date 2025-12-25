import { ReactNode, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const buildRedirectParam = (pathname: string, search: string) => {
  const target = `${pathname}${search}`;
  return encodeURIComponent(target);
};

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, isLoading, isEmailVerified } = useAuth();
  const location = useLocation();
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-cta border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    const redirectParam = buildRedirectParam(location.pathname, location.search);
    return <Navigate to={`/auth?redirect=${redirectParam}`} replace />;
  }

  if (!isEmailVerified) {
    const handleResend = async () => {
      if (!user.email) return;
      setResendStatus("sending");
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      });
      if (!error) {
        setResendStatus("sent");
      } else {
        console.error("[AUTH] Failed to resend verification:", error);
        setResendStatus("idle");
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full px-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-soft text-center space-y-4">
            <h1 className="text-xl font-semibold">Verify your email to continue</h1>
            <p className="text-sm text-muted-foreground">
              We sent a verification link to <span className="font-medium">{user.email}</span>.
              Please verify your email to access your account.
            </p>
            <Button
              className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
              disabled={resendStatus === "sending" || resendStatus === "sent"}
              onClick={handleResend}
            >
              {resendStatus === "sent" ? "Verification email sent" : "Resend verification email"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
