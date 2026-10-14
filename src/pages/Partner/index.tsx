import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ArrowLeft } from "lucide-react";
import PartnerProspects from "./PartnerProspects";

type Access = {
  state: "none" | "suspended" | "needs_agreement" | "active";
  partner_id?: string;
  referral_code?: string;
  display_name?: string | null;
  agreement?: { id: string; version: string; title: string; body: string } | null;
};

const db = supabase as any;
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function PartnerDashboard() {
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const { data: access, isLoading } = useQuery({
    queryKey: ["partner-access"],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_partner_access");
      if (error) throw error;
      return data as Access;
    },
  });

  const active = access?.state === "active";

  const { data: summary } = useQuery({
    queryKey: ["partner-summary", access?.partner_id],
    enabled: active,
    queryFn: async () => {
      const [prospects, commissions, rates, me] = await Promise.all([
        db.from("partner_prospects").select("status"),
        db.from("partner_commissions").select("status, amount_cents"),
        db.from("partner_rate_versions").select("commission_type, rate, months, effective_from").order("effective_from", { ascending: false }),
        db.from("partners").select("payout_method, country").eq("id", access!.partner_id).maybeSingle(),
      ]);
      const byStatus: Record<string, number> = {};
      (prospects.data ?? []).forEach((p: any) => (byStatus[p.status] = (byStatus[p.status] ?? 0) + 1));
      const totals = { pending: 0, earned: 0, paid: 0 };
      (commissions.data ?? []).forEach((c: any) => {
        if (c.status === "pending" || c.status === "held") totals.pending += c.amount_cents;
        else if (c.status === "earned" || c.status === "approved") totals.earned += c.amount_cents;
        else if (c.status === "paid") totals.paid += c.amount_cents;
      });
      const latest: Record<string, any> = {};
      (rates.data ?? []).forEach((r: any) => (latest[r.commission_type] ??= r));
      return { byStatus, totals, rates: latest, payout: me.data };
    },
  });

  const accept = async () => {
    if (!access?.agreement) return;
    setAccepting(true);
    const { error } = await db.rpc("accept_partner_agreement", {
      p_agreement_id: access.agreement.id,
      p_user_agent: navigator.userAgent,
    });
    setAccepting(false);
    if (error) return toast.error(error.message);
    toast.success("Agreement accepted. Welcome aboard!");
    qc.invalidateQueries({ queryKey: ["partner-access"] });
  };

  if (isLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  if (!access || access.state === "none" || access.state === "suspended") {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Partner access</CardTitle>
            <CardDescription>
              {access?.state === "suspended"
                ? "Your partner account is suspended. Contact Ringster for help."
                : "This area is for invited Ringster sales partners."}
            </CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  if (access.state === "needs_agreement") {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>{access.agreement?.title ?? "Partner agreement"}</CardTitle>
            <CardDescription>Version {access.agreement?.version}. Please read and accept to activate your partner account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[50vh] overflow-auto whitespace-pre-wrap text-sm border rounded-md p-4 bg-muted/30">
              {access.agreement?.body ?? "No agreement is published yet."}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} />
              I have read and agree to this partner agreement and outreach standards.
            </label>
            <Button disabled={!agreed || accepting || !access.agreement} onClick={accept}>
              {accepting ? "Accepting…" : "Accept and continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const link = `https://getringster.com/?ref=${access.referral_code}`;
  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
  const s = summary?.byStatus ?? {};

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Partner dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome{access.display_name ? `, ${access.display_name}` : ""}.</p>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Link></Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Your referral link</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-center">
            <code className="px-3 py-2 rounded bg-muted text-sm">{link}</code>
            <Button size="sm" variant="outline" onClick={() => copy(link)}><Copy className="h-4 w-4 mr-1" />Copy link</Button>
            <span className="text-sm text-muted-foreground">Code:</span>
            <Badge variant="secondary" className="text-sm">{access.referral_code}</Badge>
            <Button size="sm" variant="ghost" onClick={() => copy(access.referral_code!)}><Copy className="h-4 w-4" /></Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Registered", (s.registered ?? 0) + (s.contacted ?? 0) + (s.qualified ?? 0)],
            ["Demos booked", (s.demo_booked ?? 0) + (s.demo_completed ?? 0)],
            ["Demos completed", s.demo_completed ?? 0],
            ["Paying customers", s.paying ?? 0],
          ].map(([l, v]) => (
            <Card key={l as string}><CardContent className="pt-6"><div className="text-2xl font-semibold">{v}</div><div className="text-sm text-muted-foreground">{l}</div></CardContent></Card>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {(["pending", "earned", "paid"] as const).map((k) => (
            <Card key={k}><CardContent className="pt-6"><div className="text-2xl font-semibold">{fmt(summary?.totals[k] ?? 0)}</div><div className="text-sm text-muted-foreground capitalize">{k} commission</div></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Your commission terms</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {summary?.rates.assisted && <p>Referral assisted: {(summary.rates.assisted.rate * 100).toFixed(0)}% for {summary.rates.assisted.months} months</p>}
            {summary?.rates.closed && <p>Partner closed: {(summary.rates.closed.rate * 100).toFixed(0)}% for {summary.rates.closed.months} months</p>}
            <p>Payout method: {summary?.payout?.payout_method ? ({ interac_etransfer: "Interac e-transfer", wise: "Wise", paypal: "PayPal", wire: "Wire transfer" } as Record<string, string>)[summary.payout.payout_method] ?? summary.payout.payout_method : "Not set yet. Ringster will contact you."}</p>
            <p>Payouts are made on the 15th of each month for approved commission (minimum $50; smaller balances roll forward). Holding period: 30 days for monthly plans, 45 days for annual plans.</p>
            <p className="text-muted-foreground">Ringster sets the commission type from your documented sales activity. Demo booking and sales materials are coming next.</p>
          </CardContent>
        </Card>
        <PartnerProspects />
      </div>
    </div>
  );
}
