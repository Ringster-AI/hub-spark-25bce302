import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase, supabaseConfig } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const SUPABASE_URL = supabaseConfig.url;
const SUPABASE_ANON_KEY = supabaseConfig.key;

type State = "loading" | "ready" | "success" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("Missing unsubscribe token.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Invalid or expired link.");
        setEmail(data?.email ?? null);
        setState("ready");
      } catch (e: any) {
        setError(e.message || "Invalid link.");
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      setState("success");
    } catch (e: any) {
      setError(e.message || "Could not unsubscribe.");
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Unsubscribe</h1>

        {state === "loading" && (
          <p className="text-muted-foreground">Verifying your link…</p>
        )}

        {state === "ready" && (
          <>
            <p className="text-muted-foreground mb-6">
              Unsubscribe {email ? <strong className="text-foreground">{email}</strong> : "this address"} from
              Ringster notifications? You'll still receive essential account and security emails.
            </p>
            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? "Unsubscribing…" : "Confirm unsubscribe"}
            </Button>
          </>
        )}

        {state === "success" && (
          <p className="text-foreground">
            You've been unsubscribed. We're sorry to see you go.
          </p>
        )}

        {state === "error" && (
          <p className="text-destructive">{error}</p>
        )}
      </div>
    </main>
  );
}
