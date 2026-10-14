import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const db = supabase as any;
const METHOD: Record<string, string> = { manual: "Admin assigned", prospect_match: "Registered prospect", code: "Referral code", link: "Referral link" };

export default function AdminPartnerAttributions({ partners }: { partners: { id: string; display_name: string | null; email?: string }[] }) {
  const qc = useQueryClient();
  const [m, setM] = useState({ email: "", partner: "", type: "assisted", reason: "" });
  const name = (id: string) => { const p = partners.find((x) => x.id === id); return p?.display_name ?? p?.email ?? id.slice(0, 8); };

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-partner-attributions"],
    queryFn: async () => {
      const { data, error } = await db.from("partner_attributions").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r: any) => r.account_id))];
      const { data: profs } = ids.length ? await db.from("profiles").select("id,email,full_name").in("id", ids) : { data: [] };
      return (data ?? []).map((r: any) => ({ ...r, account: (profs ?? []).find((p: any) => p.id === r.account_id) }));
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-partner-attributions"] });

  const act = async (id: string, action: string, type: string | null = null) => {
    const reason = prompt("Reason (logged):");
    if (!reason) return;
    const { error } = await db.rpc("admin_review_attribution", { p_id: id, p_action: action, p_type: type, p_reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Updated"); refresh();
  };

  const manual = async () => {
    const { error } = await db.rpc("admin_create_manual_attribution", { p_account_email: m.email, p_partner: m.partner, p_type: m.type, p_reason: m.reason });
    if (error) return toast.error(error.message);
    toast.success("Partner credited"); setM({ email: "", partner: "", type: "assisted", reason: "" }); refresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Customer credit</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Partners get credit automatically on a customer's first paid subscription payment. Accounts that already existed before the partner's referral wait here for your approval.</p>
        <div className="grid sm:grid-cols-5 gap-2 items-center">
          <Input placeholder="Customer account email" value={m.email} onChange={(e) => setM({ ...m, email: e.target.value })} />
          <Select value={m.partner} onValueChange={(v) => setM({ ...m, partner: v })}>
            <SelectTrigger><SelectValue placeholder="Partner" /></SelectTrigger>
            <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name ?? p.email}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={m.type} onValueChange={(v) => setM({ ...m, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="assisted">Referral assisted</SelectItem><SelectItem value="closed">Partner closed</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
          </Select>
          <Input placeholder="Reason" value={m.reason} onChange={(e) => setM({ ...m, reason: e.target.value })} />
          <Button size="sm" disabled={!m.email || !m.partner || !m.reason} onClick={manual}>Credit manually</Button>
        </div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No credited customers yet.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Partner</TableHead><TableHead>How</TableHead><TableHead>Type / rate</TableHead><TableHead>Eligible until</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.account?.full_name ?? r.account?.email ?? r.account_id.slice(0, 8)}<div className="text-xs text-muted-foreground">{r.conversion_kind === "existing_free_account" ? "Existing account" : "New signup"}</div><button className="text-xs text-muted-foreground underline" onClick={() => { navigator.clipboard.writeText(r.id); toast.success("Credit ID copied"); }}>Copy ID</button></TableCell>
                  <TableCell>{name(r.partner_id)}</TableCell>
                  <TableCell>{METHOD[r.method]}</TableCell>
                  <TableCell>
                    <Select value={r.commission_type} onValueChange={(v) => act(r.id, "set_type", v)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="assisted">Assisted</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">{(r.rate_snapshot * 100).toFixed(0)}% · {r.months_snapshot} mo</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.eligibility_ends_at ? new Date(r.eligibility_ends_at).toLocaleDateString() : "Starts at first payment"}</TableCell>
                  <TableCell><Badge variant={r.status === "active" ? "default" : "outline"}>{r.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status === "pending_approval" && <><Button size="sm" onClick={() => act(r.id, "approve")}>Approve</Button><Button size="sm" variant="ghost" onClick={() => act(r.id, "reject")}>Reject</Button></>}
                    {r.status === "active" && <Button size="sm" variant="ghost" onClick={() => act(r.id, "revoke")}>Revoke</Button>}
                  </TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
