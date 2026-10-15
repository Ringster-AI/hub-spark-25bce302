import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo/Seo";
import { track, identifyUser } from "@/lib/analytics";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Loader2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  PhoneCall,
  Mail,
} from "lucide-react";
import {
  INDUSTRIES,
  USE_CASES,
  industryAgentName,
  industryGreeting,
} from "@/lib/industryDefaults";
import { ORGANIZATION_SIZES } from "@/types/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type FormValues = {
  email: string;
  company: string;
  size: string;
  industry: string;
  useCase: string;
  termsAccepted: boolean;
  marketingConsent: boolean;
};

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: {
      email: "",
      company: "",
      size: "",
      industry: "",
      useCase: "inbound",
      termsAccepted: false,
      marketingConsent: false,
    },
  });

  const values = form.watch();

  const previewAgentName = useMemo(
    () => industryAgentName(values.industry),
    [values.industry]
  );
  const previewGreeting = useMemo(
    () => industryGreeting(values.industry, values.company || "your team"),
    [values.industry, values.company]
  );

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const handleStepOne = () => {
    setError(null);
    if (!values.email || !/^\S+@\S+\.\S+$/.test(values.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setStep(2);
  };

  const sendCode = async (resend = false) => {
    setError(null);
    const data = form.getValues();
    if (!resend) {
      if (!data.termsAccepted) {
        toast.error("Please accept the Terms to continue.");
        return;
      }
      if (!data.company || !data.size || !data.industry) {
        toast.error("Please complete every field to launch your agent.");
        return;
      }
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: data.email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          data: {
            full_name: "",
            company: data.company,
          },
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setStep(3);
      setResendIn(30);
      if (resend) toast.success("New code sent.");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyAndProvision = async (token: string) => {
    setError(null);
    setVerifying(true);
    const data = form.getValues();
    try {
      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          email: data.email.trim().toLowerCase(),
          token,
          type: "email",
        });
      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        setCode("");
        return;
      }

      const userId = verifyData.user?.id;
      if (userId) {
        await Promise.all([
          supabase.from("organizations").insert({
            name: data.company,
            size: data.size,
            user_id: userId,
          }),
          supabase
            .from("profiles")
            .update({
              industry: data.industry,
              use_case: data.useCase,
              marketing_consent: data.marketingConsent,
              marketing_consent_at: data.marketingConsent
                ? new Date().toISOString()
                : null,
              terms_accepted_at: new Date().toISOString(),
            })
            .eq("id", userId),
        ]);
      }

      if (typeof (window as any).fbq === "function") {
        (window as any).fbq("track", "CompleteRegistration");
      }

      if (userId) {
        identifyUser(userId, { email: data.email, company: data.company, industry: data.industry });
        track("Signed_Up", { method: "otp", industry: data.industry });
      }

      if (userId) {
        supabase.functions
          .invoke("send-transactional-email", {
            body: {
              templateName: "welcome",
              recipientEmail: data.email,
              idempotencyKey: `welcome-${userId}`,
              templateData: { name: data.company },
            },
          })
          .catch((e) => console.warn("welcome email enqueue failed", e));
      }

      if (nextPath) {
        toast.success("Welcome to Ringster!");
        navigate(nextPath, { replace: true });
      } else {
        toast.success("Welcome to Ringster — let's launch your agent.");
        navigate("/onboarding");
      }
    } catch (e: any) {
      console.error("Signup verify error:", e);
      toast.error(e?.message || "Failed to create account. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Sign Up for Ringster — Launch your AI voice agent"
        description="Create your Ringster account and launch an AI voice agent that answers calls and books appointments 24/7. 60 free credits, no credit card."
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
            <div className="mb-2 flex items-center gap-3 text-xs text-white/40">
              <span className={step === 1 ? "text-white" : ""}>1 · Email</span>
              <span className="h-px w-6 bg-white/15" />
              <span className={step === 2 ? "text-white" : ""}>2 · Business</span>
              <span className="h-px w-6 bg-white/15" />
              <span className={step === 3 ? "text-white" : ""}>3 · Verify</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {step === 1
                ? "Create your account"
                : step === 2
                ? "Tell us about your business"
                : "Check your email"}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {step === 1
                ? "Start in seconds with a one-time code. 60 free credits, no credit card."
                : step === 2
                ? "We'll tailor your AI agent to fit how you work."
                : (
                  <>We sent a 6-digit code to{" "}
                    <span className="text-white/90">{values.email}</span>
                  </>
                )}
            </p>

            {error && (
              <Alert
                variant="destructive"
                className="mt-6 bg-red-500/10 border-red-500/20 text-red-200"
              >
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === 1 && (
              <form
                onSubmit={(e) => { e.preventDefault(); handleStepOne(); }}
                className="mt-8 space-y-6"
              >
                <div className="space-y-2">
                  <Label className="text-white/80">Email</Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    {...form.register("email", { required: true })}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="you@company.com"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-center text-sm text-white/50">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-indigo-300 hover:underline"
                    onClick={() => navigate(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login")}
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}

            {step === 2 && (
              <form
                onSubmit={(e) => { e.preventDefault(); sendCode(); }}
                className="mt-8 space-y-6"
              >
                <div className="space-y-2">
                  <Label className="text-white/80">Company name</Label>
                  <Input
                    {...form.register("company", { required: true })}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="Acme Plumbing"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">Industry</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {INDUSTRIES.map((i) => (
                      <button
                        key={i.key}
                        type="button"
                        onClick={() => form.setValue("industry", i.key)}
                        className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                          values.industry === i.key
                            ? "border-indigo-400 bg-indigo-500/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-white/80">Team size</Label>
                    <Select onValueChange={(v) => form.setValue("size", v)} value={values.size}>
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {ORGANIZATION_SIZES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/80">Primary use</Label>
                    <Select
                      onValueChange={(v) => form.setValue("useCase", v)}
                      value={values.useCase}
                    >
                      <SelectTrigger className="border-white/10 bg-white/5 text-white">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {USE_CASES.map((u) => (
                          <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <label className="flex items-start gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      {...form.register("termsAccepted")}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    <span>
                      I agree to the{" "}
                      <a href="/terms" target="_blank" className="text-indigo-300 hover:underline">Terms</a>
                      {" "}and{" "}
                      <a href="/privacy" target="_blank" className="text-indigo-300 hover:underline">Privacy Policy</a>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-white/60">
                    <input
                      type="checkbox"
                      {...form.register("marketingConsent")}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5"
                    />
                    <span>Send me occasional product updates (optional)</span>
                  </label>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep(1)}
                    className="text-white/60 hover:text-white"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit" size="lg" disabled={isLoading} className="flex-1">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Mail className="mr-2 h-4 w-4" />
                    Send verification code
                  </Button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className="mt-8 space-y-6">
                <div className="space-y-3">
                  <Label className="text-white/80">Enter 6-digit code</Label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      onChange={(v) => {
                        setCode(v);
                        if (v.length === 6) {
                          setTimeout(() => verifyAndProvision(v), 0);
                        }
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={verifying || code.length !== 6}
                  onClick={() => verifyAndProvision(code)}
                >
                  {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & launch my agent <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep(2); setCode(""); setError(null); }}
                    className="flex items-center gap-1 text-white/60 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0 || isLoading}
                    onClick={() => sendCode(true)}
                    className="text-indigo-300 hover:underline disabled:text-white/30 disabled:no-underline"
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </div>
              </div>
            )}
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
              Live preview
            </p>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl shadow-[0_30px_80px_-30px_rgba(79,70,229,0.5)]">
              <div className="flex items-center gap-3">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-base font-semibold">
                  {previewAgentName.charAt(0)}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-[#0a0a1a]" />
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{previewAgentName}</p>
                  <p className="text-xs text-white/50">
                    {values.industry
                      ? INDUSTRIES.find((i) => i.key === values.industry)?.label + " agent"
                      : "Your AI voice agent"}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
                  <PhoneCall className="h-3 w-3" /> Ready
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-white/5 bg-[#0a0a1a]/60 p-4">
                <p className="text-[10px] uppercase tracking-widest text-white/30">Opening greeting</p>
                <p className="mt-1 text-sm leading-relaxed text-white/85">
                  {previewGreeting}
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
};

export default Signup;
