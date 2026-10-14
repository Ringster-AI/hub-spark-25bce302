import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import AdminPartnerProspects from "./AdminPartnerProspects";
import AdminPartnerAttributions from "./AdminPartnerAttributions";

const db = supabase as any;

export default function AdminPartners() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: partners = [] } = useQuery({
    queryKey: ["admin-partners"],
    queryFn: async () => {
      const { data, error } = await db
        .from("partners")
        .select("id, invite_email, display_name, referral_code, status, created_at, country, payout_method, payout_contact, partner_rate_versions(commission_type, rate, months, effective_from)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await db.rpc("admin_invite_partner", { p_email: email.trim(), p_display_name: name.trim() || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Partner invited. Ask them to sign in (or sign up with this email) and open /partner.");
    setEmail(""); setName("");
    qc.invalidateQueries({ queryKey: ["admin-partners"] });
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await db.from("partners").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-partners"] });
  };

  const rateOf = (p: any, t: string) => {
    const r = (p.partner_rate_versions ?? []).filter((x: any) => x.commission_type === t)
      .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from))[0];
    return r ? `${(r.rate * 100).toFixed(0)}% / ${r.months}mo` : "—";
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Sales partners</h1>
        <p className="text-sm text-muted-foreground">Invite partners. They activate by accepting the partner agreement at /partner.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Invite a partner</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={invite} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <Button disabled={busy}>{busy ? "Inviting…" : "Invite"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Partner</TableHead><TableHead>Code</TableHead><TableHead>Assisted</TableHead><TableHead>Closed</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {partners.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell><div className="font-medium">{p.display_name ?? "—"}</div><div className="text-xs text-muted-foreground">{p.invite_email}</div></TableCell>
                  <TableCell><code>{p.referral_code}</code></TableCell>
                  <TableCell>{rateOf(p, "assisted")}</TableCell>
                  <TableCell>{rateOf(p, "closed")}</TableCell>
                  <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {p.status !== "suspended"
                      ? <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "suspended")}>Suspend</Button>
                      : <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "active")}>Reactivate</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {partners.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No partners yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AdminPartnerAttributions partners={partners.map((p: any) => ({ id: p.id, display_name: p.display_name, email: p.invite_email }))} />
      <AdminPartnerProspects partners={partners.map((p: any) => ({ id: p.id, display_name: p.display_name, email: p.invite_email }))} />
    </div>
  );
}
