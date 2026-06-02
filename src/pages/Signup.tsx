import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo/Seo";
import { Loader2, Sparkles, ArrowRight, ArrowLeft, Check, ShieldCheck, PhoneCall } from "lucide-react";
import { INDUSTRIES, USE_CASES, industryAgentName, industryGreeting } from "@/lib/industryDefaults";
import { ORGANIZATION_SIZES } from "@/types/auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormValues = {
  email: string;
  password: string;
  company: string;
  size: string;
  industry: string;
  useCase: string;
  termsAccepted: boolean;
  marketingConsent: boolean;
};

const passwordIssues = (password: string) => {
  const issues: string[] = [];
  if (password.length < 6) issues.push("at least 6 characters");
  if (!/[a-z]/.test(password)) issues.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) issues.push("an uppercase letter");
  if (!/[0-9]/.test(password)) issues.push("a number");
  return issues;
};

const passwordScore = (password: string) => {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
};

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      email: "",
      password: "",
      company: "",
      size: "",
      industry: "",
      useCase: "inbound",
      termsAccepted: false,
      marketingConsent: false,
    },
  });

  const values = form.watch();
  const issues = passwordIssues(values.password || "");
  const score = passwordScore(values.password || "");

  const previewAgentName = useMemo(
    () => industryAgentName(values.industry),
    [values.industry]
  );
  const previewGreeting = useMemo(
    () => industryGreeting(values.industry, values.company || "your team"),
    [values.industry, values.company]
  );

  const handleStepOne = () => {
    if (!values.email || !values.password) {
      toast.error("Enter your email and a password to continue.");
      return;
    }
    if (issues.length > 0) {
      toast.error(`Password needs ${issues.join(", ")}.`);
      return;
    }
    setStep(2);
  };

  const onSubmit = async (data: FormValues) => {
    if (!data.termsAccepted) {
      toast.error("Please accept the Terms to continue.");
      return;
    }
    if (!data.company || !data.size || !data.industry) {
      toast.error("Please complete every field to launch your agent.");
      return;
    }
    try {
      setIsLoading(true);
      const { error: signUpError, data: authData } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: "" } },
      });
      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          toast.error("This email is already registered. Please sign in instead.");
          return;
        }
        throw signUpError;
      }

      const userId = authData.user?.id;
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
              marketing_consent_at: data.marketingConsent ? new Date().toISOString() : null,
              terms_accepted_at: new Date().toISOString(),
            })
            .eq("id", userId),
        ]);
      }

      if (typeof (window as any).fbq === "function") {
        (window as any).fbq("track", "CompleteRegistration");
      }

      // Fire-and-forget welcome email (idempotent on user id)
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

      toast.success("Welcome to Ringster — let's launch your agent.");
      navigate("/onboarding");

    } catch (error: any) {
      console.error("Signup error:", error);
      toast.error(error?.message || "Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Sign Up for Ringster — Launch your AI voice agent"
        description="Create your Ringster account and launch an AI voice agent that answers calls and books appointments 24/7. 60 free credits, no credit card."
      />

      {/* Ambient gradients */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 left-1/3 h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[640px] rounded-full bg-indigo-500/15 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        {/* Left – Form */}
        <div className="flex flex-col px-6 py-10 sm:px-10 lg:py-14">
          <div className="mb-10 flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
            <Sparkles className="h-4 w-4 text-indigo-300" />
            Ringster
          </div>

          <div className="mx-auto w-full max-w-md flex-1">
            <div className="mb-2 flex items-center gap-3 text-xs text-white/40">
              <span className={step === 1 ? "text-white" : ""}>1 · Account</span>
              <span className="h-px w-6 bg-white/15" />
              <span className={step === 2 ? "text-white" : ""}>2 · Your business</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {step === 1 ? "Create your account" : "Tell us about your business"}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {step === 1
                ? "Start in seconds. 60 free credits, no credit card."
                : "We'll tailor your AI agent to fit how you work."}
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
              {step === 1 ? (
                <>
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

                  <div className="space-y-2">
                    <Label className="text-white/80">Password</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      {...form.register("password", { required: true })}
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                      placeholder="At least 6 characters"
                    />
                    {values.password && (
                      <div className="mt-2 space-y-2">
                        <div className="flex h-1 gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={`h-full flex-1 rounded-full transition-colors ${
                                i < score
                                  ? score < 2
                                    ? "bg-red-400/70"
                                    : score < 3
                                    ? "bg-amber-300/70"
                                    : "bg-emerald-400/70"
                                  : "bg-white/10"
                              }`}
                            />
                          ))}
                        </div>
                        {issues.length > 0 ? (
                          <p className="text-xs text-white/40">Needs {issues.join(", ")}.</p>
                        ) : (
                          <p className="text-xs text-emerald-300/80">Looks strong.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="lg"
                    onClick={handleStepOne}
                    className="w-full"
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
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
                      Launch my agent <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              <p className="text-center text-sm text-white/50">
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-indigo-300 hover:underline"
                  onClick={() => navigate("/login")}
                >
                  Sign in
                </button>
              </p>
            </form>
          </div>

          <div className="mx-auto mt-10 flex w-full max-w-md flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-widest text-white/40">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SOC2-ready</span>
            <span>· GDPR</span>
            <span>· 60 free credits</span>
            <span>· No credit card</span>
          </div>
        </div>

        {/* Right – Preview */}
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
