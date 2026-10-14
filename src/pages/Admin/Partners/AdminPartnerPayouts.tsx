import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const db = supabase as any;
const money = (c: number, cur = "usd") => `${cur.toUpperCase()} ${(c / 100).toFixed(2)}`;

export default function AdminPartnerPayouts({ partners }: { partners: { id: string; display_name: string | null; email?: string }[] }) {
  const qc = useQueryClient();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [adj, setAdj] = useState({ attribution: "", amount: "", reason: "" });
  const name = (id: string) => { const p = partners.find((x) => x.id === id); return p?.display_name ?? p?.email ?? id.slice(0, 8); };

  const { data } = useQuery({
    queryKey: ["admin-partner-payouts"],
    queryFn: async () => {
      const [po, cm] = await Promise.all([
        db.from("partner_payouts").select("*").order("created_at", { ascending: false }).limit(200),
        db.from("partner_commissions").select("id,partner_id,attribution_id,source_type,amount_cents,currency,status,occurred_at,earn_after,reason").order("occurred_at", { ascending: false }).limit(300),
      ]);
      return { payouts: po.data ?? [], commissions: cm.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-partner-payouts"] });

  const build = async () => {
    const { data: n, error } = await db.rpc("admin_build_payouts", { p_period: period });
    if (error) return toast.error(error.message);
    toast.success(`${n} payout record(s) created for ${period}`); refresh();
  };
  const setStatus = async (id: string, status: string) => {
    let ref: string | null = null;
    if (status === "paid") { ref = prompt("Payment reference (e-transfer / Wise / PayPal ID):"); if (!ref) return; }
    const { error } = await db.rpc("admin_set_payout_status", { p_payout: id, p_status: status, p_reference: ref });
    if (error) return toast.error(error.message);
    toast.success("Updated"); refresh();
  };
  const addAdj = async () => {
    const { error } = await db.rpc("admin_add_commission_adjustment", {
      p_attribution: adj.attribution.trim(), p_amount_cents: Math.round(Number(adj.amount) * 100), p_reason: adj.reason,
    });
    if (error) return toast.error(error.message);
    toast.success("Adjustment added"); setAdj({ attribution: "", amount: "", reason: "" }); refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Commissions & payouts</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-32" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" />
          <Button size="sm" onClick={build}>Build payout run</Button>
          <span className="text-xs text-muted-foreground">Collects all earned commission. Balances under $50 roll forward.</span>
        </div>

        {(data?.payouts ?? []).length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Partner</TableHead><TableHead>Period</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{data!.payouts.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{name(p.partner_id)}</TableCell>
                <TableCell>{p.period} <span className="text-xs text-muted-foreground">(on {p.scheduled_for})</span></TableCell>
                <TableCell>{p.status === "carried_forward" ? `${money(p.carried_forward_cents, p.currency)} rolled forward` : money(p.total_cents, p.currency)}</TableCell>
                <TableCell><Badge variant="outline">{p.status.replace("_", " ")}</Badge>{p.reference && <div className="text-xs text-muted-foreground">Ref {p.reference}</div>}</TableCell>
                <TableCell className="text-right">
                  {p.status === "draft" && <Button size="sm" onClick={() => setStatus(p.id, "approved")}>Approve</Button>}
                  {p.status === "approved" && <Button size="sm" onClick={() => setStatus(p.id, "paid")}>Mark paid</Button>}
                </TableCell>
              </TableRow>))}
            </TableBody>
          </Table>
        )}

        <div>
          <div className="text-sm font-medium mb-2">Recent commission entries</div>
          {(data?.commissions ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None yet. They appear when credited customers pay.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Partner</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{data!.commissions.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{new Date(c.occurred_at).toLocaleDateString()}</TableCell>
                  <TableCell>{name(c.partner_id)}</TableCell>
                  <TableCell className="text-sm">{c.source_type.replace(/_/g, " ")}{c.reason && <div className="text-xs text-muted-foreground">{c.reason}</div>}</TableCell>
                  <TableCell>{money(c.amount_cents, c.currency)}</TableCell>
                  <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="grid sm:grid-cols-4 gap-2 items-center">
          <Input placeholder="Customer credit ID" value={adj.attribution} onChange={(e) => setAdj({ ...adj, attribution: e.target.value })} />
          <Input placeholder="Amount (e.g. -12.50)" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
          <Input placeholder="Reason" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          <Button size="sm" variant="outline" disabled={!adj.attribution || !adj.amount || !adj.reason} onClick={addAdj}>Add adjustment</Button>
        </div>
      </CardContent>
    </Card>
  );
}
