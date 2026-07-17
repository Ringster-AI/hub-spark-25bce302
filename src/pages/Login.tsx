import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo/Seo";
import { Sparkles, ShieldCheck, PhoneCall, Check, Loader2, LogIn } from "lucide-react";
import { track, identifyUser } from "@/lib/analytics";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  // Only honor same-origin, relative paths starting with a single "/".
  const nextPath =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const goNext = () => {
    if (nextPath) {
      window.location.href = nextPath;
    } else {
      navigate("/dashboard", { replace: true });
    }
  };
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) goNext();
      setCheckingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goNext();
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, nextPath]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setSigningIn(true);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setError(error.message);
        return;
      }
      if (signInData?.user?.id) {
        identifyUser(signInData.user.id, { email: signInData.user.email });
        track("Signed_In", { method: "password" });
      }
      // onAuthStateChange will navigate
    } finally {
      setSigningIn(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="animate-pulse text-white/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Sign In to Ringster — AI Receptionist Dashboard"
        description="Log in to Ringster to manage your AI voice receptionist, agents, call logs, and subscription in one place."
      />

      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 left-1/3 h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[640px] rounded-full bg-indigo-500/15 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col px-6 py-10 sm:px-10 lg:py-14">
          <div className="mb-10 flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Ringster
          </div>

          <div className="mx-auto w-full max-w-md flex-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Sign in to your Ringster account.
            </p>

            <div className="mt-8">
              {error && (
                <Alert variant="destructive" className="mb-4 bg-red-500/10 border-red-500/20 text-red-200">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-white/80">Email</Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="you@company.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-white/80">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-indigo-300 hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={signingIn}>
                  {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-white/50">
                Don't have an account?{" "}
                <button
                  type="button"
                  className="text-indigo-300 hover:underline"
                  onClick={() => navigate("/signup")}
                >
                  Sign up
                </button>
              </p>
            </div>
          </div>

          <div className="mx-auto mt-10 flex w-full max-w-md flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-widest text-white/40">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SOC2-ready</span>
            <span>· GDPR</span>
            <span>· 60 free credits</span>
            <span>· No credit card</span>
          </div>
        </div>

        <div className="hidden lg:flex relative items-center justify-center border-l border-white/5 px-10">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-900/20 via-transparent to-transparent" />
          <div className="w-full max-w-md">
            <p className="mb-4 text-[11px] uppercase tracking-[0.18em] text-white/40">
              Your AI voice agent
            </p>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl shadow-[0_30px_80px_-30px_rgba(79,70,229,0.5)]">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-base font-semibold">
                  R
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#0a0a1a]" />
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Ringster AI</p>
                  <p className="text-xs text-white/50">Your AI voice receptionist</p>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                  <PhoneCall className="h-3 w-3" /> Ready
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/5 bg-[#0a0a1a]/60 p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/30">Opening greeting</p>
                <p className="mt-1 text-sm leading-relaxed text-white/85">
                  "Hi, you've reached Ringster. I'm your AI voice agent — here to take calls, answer questions, and book appointments around the clock. How can I help you today?"
                </p>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { k: "Answers 24/7" },
                  { k: "Books calendar" },
                  { k: "Routes urgents" },
                ].map((b) => (
                  <div key={b.k} className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[11px] text-white/70">
                    <Check className="h-3 w-3 text-emerald-300" /> {b.k}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { v: "<30s", l: "to live" },
                { v: "24/7", l: "coverage" },
                { v: "60", l: "free credits" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <p className="text-lg font-semibold text-white">{s.v}</p>
                  <p className="text-[10px] uppercase tracking-widest text-white/40">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
