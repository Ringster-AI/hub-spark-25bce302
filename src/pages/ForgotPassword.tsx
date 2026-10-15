import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo/Seo";
import { Sparkles, Loader2, MailCheck, KeyRound } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Reset Your Password — Ringster"
        description="Request a password reset link for your Ringster account."
      />

      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 left-1/3 h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[160px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[640px] rounded-full bg-indigo-500/15 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-10 sm:px-10 lg:py-14">
        <div className="mb-10 flex items-center gap-2 text-sm font-medium tracking-wide text-white/80">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          Ringster
        </div>

        <div className="mx-auto w-full max-w-md flex-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Enter your account email and we'll send you a reset link.
          </p>

          <div className="mt-8">
            {error && (
              <Alert variant="destructive" className="mb-4 bg-red-500/10 border-red-500/20 text-red-200">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {sent ? (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-6 text-center">
                <MailCheck className="mx-auto h-8 w-8 text-indigo-300" />
                <p className="mt-3 text-sm text-white/80">
                  If an account exists for <span className="font-medium text-white">{email}</span>,
                  a reset link is on its way. Check your inbox — and your spam folder.
                </p>
                <p className="mt-4 text-xs text-white/50">
                  The link expires after a short time. You can request a new one if it does.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
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
                <Button type="submit" size="lg" className="w-full" disabled={sending}>
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <KeyRound className="mr-2 h-4 w-4" />
                  Send reset link
                </Button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-white/50">
              Remembered it?{" "}
              <Link to="/login" className="text-indigo-300 hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
