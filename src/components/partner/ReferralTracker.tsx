import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const KEY = "ringster_ref";
const db = supabase as any;

async function flush() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  try {
    const { code, url } = JSON.parse(raw);
    await db.rpc("record_referral_touch", { p_code: code, p_source: "link", p_landing_url: url, p_user_agent: navigator.userAgent });
  } catch { /* ignore */ }
  localStorage.removeItem(KEY);
}

/** Captures ?ref=CODE and records it against the account once the visitor is signed in. */
export function ReferralTracker() {
  const loc = useLocation();
  useEffect(() => {
    const ref = new URLSearchParams(loc.search).get("ref");
    if (ref && /^[A-Za-z0-9_-]{3,40}$/.test(ref) && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, JSON.stringify({ code: ref, url: window.location.href, at: Date.now() }));
    }
    flush();
  }, [loc.search]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") flush(); });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}

/** Lets a customer enter a partner's referral code. */
export function ReferralCodeInput() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("record_referral_touch", {
      p_code: code.trim(), p_source: "code", p_landing_url: window.location.href, p_user_agent: navigator.userAgent,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data?.ok) return toast.error(data?.message ?? "That referral code is not valid.");
    toast.success("Referral code saved."); setCode("");
  };
  return (
    <Card className="mb-6">
      <CardContent className="pt-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Referred by a Ringster partner?</span>
        <Input className="w-48 h-9" placeholder="Referral code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || code.trim().length < 3} onClick={submit}>Apply</Button>
      </CardContent>
    </Card>
  );
}
