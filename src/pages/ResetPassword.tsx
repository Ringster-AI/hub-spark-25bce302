import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/seo/Seo";
import { Sparkles, Loader2, LockKeyhole, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The recovery link lands here with a token in the URL hash; Supabase
    // exchanges it and fires PASSWORD_RECOVERY once the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // If the user already holds a recovery session (e.g. page reload), allow the form too.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else if (window.location.hash.includes("type=recovery")) setReady(true);
      else setInvalidLink(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/dashboard", { replace: true }), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a1a] text-white">
      <Seo
        title="Choose a New Password — Ringster"
        description="Set a new password for your Ringster account."
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
            Choose a new password
          </h1>

          <div className="mt-8">
            {error && (
              <Alert variant="destructive" className="mb-4 bg-red-500/10 border-red-500/20 text-red-200">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {done ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300" />
                <p className="mt-3 text-sm text-white/80">
                  Your password has been updated. Taking you to your dashboard…
                </p>
              </div>
            ) : invalidLink ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm text-white/80">
                  This reset link is missing or has expired. Request a fresh one to continue.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/forgot-password">Request a new link</Link>
                </Button>
              </div>
            ) : !ready ? (
              <div className="animate-pulse text-white/60">Verifying your reset link…</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-white/80">New password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="At least 8 characters"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80">Confirm new password</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
                    placeholder="Repeat it"
                    required
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  Update password
                </Button>
              </form>
            )}

            {!done && (
              <p className="mt-6 text-center text-sm text-white/50">
                <Link to="/login" className="text-indigo-300 hover:underline">
                  Back to sign in
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
