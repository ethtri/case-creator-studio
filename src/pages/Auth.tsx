import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CartSheet } from "@/components/CartSheet";
import { SiteMenu } from "@/components/SiteMenu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const REDIRECT_STORAGE_KEY = "auth:redirect";

const Auth = () => {
  const { user, isEmailVerified } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = useMemo(() => {
    const raw = searchParams.get("redirect") || "/orders";
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return raw;
    }
    return "/orders";
  }, [searchParams]);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user && isEmailVerified) {
      navigate(redirect);
      return;
    }
    if (user && !isEmailVerified) {
      setMessage("Check your email to verify your account before continuing.");
    }
  }, [user, isEmailVerified, navigate, redirect]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    }
    setIsLoading(false);
  };

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || undefined,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      toast.success("Check your email to verify your account.");
    }

    setIsLoading(false);
  };

  const handleGoogleOAuth = async () => {
    localStorage.setItem(REDIRECT_STORAGE_KEY, redirect);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-display font-bold text-lg text-foreground">Snapcase</span>
          </Link>
          <div className="flex items-center gap-3">
            <CartSheet />
            <SiteMenu />
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-md mx-auto bg-card border border-border rounded-2xl p-6 shadow-soft">
          <h1 className="text-2xl font-semibold mb-2">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin"
              ? "Sign in to access your designs and order history."
              : "Save your designs and track every order in one place."}
          </p>

          <div className="space-y-3 mb-6">
            <button
              type="button"
              className="w-full flex justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleGoogleOAuth}
              disabled={isLoading}
              aria-label="Continue with Google"
            >
              <img
                src="/auth/google-signin.png"
                alt="Continue with Google"
                className="h-11 w-auto max-w-[240px]"
              />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-6">
            <div className="flex-1 h-px bg-border" />
            <span>or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form
            className="space-y-4"
            onSubmit={mode === "signin" ? handleSignIn : handleSignUp}
          >
            {mode === "signup" && (
              <div>
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                  maxLength={120}
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                maxLength={255}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
            </div>

            {message && (
              <p className="text-sm text-destructive" role="alert" aria-live="polite">
                {message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-cta hover:bg-cta/90 text-cta-foreground"
              disabled={isLoading}
            >
              {mode === "signin" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="text-sm text-muted-foreground mt-6 text-center">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  className="min-h-11 rounded-md px-2 text-foreground underline"
                  type="button"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="min-h-11 rounded-md px-2 text-foreground underline"
                  type="button"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline">Terms</Link> and{" "}
            <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Auth;
