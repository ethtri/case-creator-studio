import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const REDIRECT_STORAGE_KEY = "auth:redirect";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  const getSafeRedirect = (value: string | null) => {
    if (value && value.startsWith("/") && !value.startsWith("//")) {
      return value;
    }
    return "/orders";
  };

  useEffect(() => {
    const finalize = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("[AUTH] Callback session error:", error);
        setStatus("error");
        return;
      }

      const redirect = getSafeRedirect(localStorage.getItem(REDIRECT_STORAGE_KEY));
      localStorage.removeItem(REDIRECT_STORAGE_KEY);
      if (data.session?.user) {
        navigate(redirect);
        return;
      }

      setStatus("done");
    };

    finalize();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        {status === "loading" && (
          <div className="animate-spin w-10 h-10 border-2 border-cta border-t-transparent rounded-full mx-auto" />
        )}
        <p className="text-muted-foreground">
          {status === "error" && "Unable to finish sign-in."}
          {status === "loading" && "Finishing sign-in..."}
          {status === "done" && "Sign-in complete. You can close this tab."}
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
