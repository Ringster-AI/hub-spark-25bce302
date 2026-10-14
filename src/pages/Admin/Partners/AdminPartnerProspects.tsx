import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { STATUS_LABEL } from "@/pages/Partner/PartnerProspects";

const db = supabase as any;

export default function AdminPartnerProspects({ partners }: { partners: { id: string; display_name: string | null; email?: string }[] }) {
  const qc = useQueryClient();
  const [house, setHouse] = useState({ business_name: "", email: "", phone: "", domain: "", note: "" });
  const name = (id: string) => partners.find((p) => p.id === id)?.display_name ?? partners.find((p) => p.id === id)?.email ?? id.slice(0, 8);

  const { data } = useQuery({
    queryKey: ["admin-partner-prospects"],
    queryFn: async () => {
      const [pr, fl, hl] = await Promise.all([
        db.from("partner_prospects").select("id,partner_id,business_name,city,location_label,status,protection_status,activity_deadline,created_at").order("created_at", { ascending: false }).limit(500),
        db.from("partner_review_flags").select("*").eq("status", "open").order("created_at", { ascending: false }),
        db.from("partner_house_accounts").select("*").order("created_at", { ascending: false }),
      ]);
      return { prospects: pr.data ?? [], flags: fl.data ?? [], house: hl.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-partner-prospects"] });

  const protect = async (id: string, action: string) => {
    let newPartner: string | null = null;
    if (action === "reassign") {
      const list = partners.map((p, i) => `${i + 1}. ${p.display_name ?? p.email}`).join("\n");
      const pick = prompt(`Reassign to which partner?\n${list}`);
      const idx = Number(pick) - 1;
      if (!partners[idx]) return;
      newPartner = partners[idx].id;
    }
    const reason = prompt("Reason (logged):");
    if (!reason) return;
    const { error } = await db.rpc("admin_set_prospect_protection", { p_prospect_id: id, p_action: action, p_new_partner: newPartner, p_reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Updated"); refresh();
  };

  const resolveFlag = async (id: string, status: string) => {
    const resolution = prompt("Resolution note:") ?? "";
    const { error } = await db.rpc("admin_resolve_partner_flag", { p_flag_id: id, p_status: status, p_resolution: resolution });
    if (error) return toast.error(error.message);
    refresh();
  };

  const addHouse = async () => {
    if (!house.business_name && !house.email && !house.phone && !house.domain) return toast.error("Enter at least one field");
    const { error } = await db.from("partner_house_accounts").insert(house);
    if (error) return toast.error(error.message);
    setHouse({ business_name: "", email: "", phone: "", domain: "", note: "" }); refresh();
  };
  const delHouse = async (id: string) => { await db.from("partner_house_accounts").delete().eq("id", id); refresh(); };

  const review = (data?.prospects ?? []).filter((p: any) => p.protection_status === "review_needed" || p.protection_status === "disputed");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Review flags ({data?.flags.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(data?.flags ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing to review.</p>}
          {(data?.flags ?? []).map((f: any) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3 text-sm">
              <div><Badge variant="outline" className="mr-2">{f.kind.replace(/_/g, " ")}</Badge>{name(f.partner_id)}
                <span className="text-muted-foreground ml-2">{JSON.stringify(f.details).slice(0, 140)}</span></div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => resolveFlag(f.id, "resolved")}>Resolve</Button>
                <Button size="sm" variant="ghost" onClick={() => resolveFlag(f.id, "dismissed")}>Dismiss</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Prospects needing review ({review.length})</CardTitle></CardHeader>
        <CardContent>
          {review.length === 0 ? <p className="text-sm text-muted-foreground">None. Prospects land here when a partner misses the 14-day outreach deadline.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Business</TableHead><TableHead>Partner</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{review.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.business_name}<div className="text-xs text-muted-foreground">{[p.location_label, p.city].filter(Boolean).join(" · ")}</div></TableCell>
                  <TableCell>{name(p.partner_id)}</TableCell>
                  <TableCell>{STATUS_LABEL[p.status]}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => protect(p.id, "restore")}>Keep protected</Button>
                    <Button size="sm" variant="outline" onClick={() => protect(p.id, "reassign")}>Reassign</Button>
                    <Button size="sm" variant="ghost" onClick={() => protect(p.id, "release")}>Release</Button>
                  </TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground mt-3">{data?.prospects.length ?? 0} prospects registered across all partners.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">House list (Ringster-owned leads)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Partners can't register these. Existing Ringster customers are blocked automatically.</p>
          <div className="grid sm:grid-cols-5 gap-2">
            {(["business_name", "email", "phone", "domain", "note"] as const).map((k) => (
              <Input key={k} placeholder={k.replace("_", " ")} value={house[k]} onChange={(e) => setHouse({ ...house, [k]: e.target.value })} />))}
          </div>
          <Button size="sm" onClick={addHouse}>Add to house list</Button>
          {(data?.house ?? []).map((h: any) => (
            <div key={h.id} className="flex items-center justify-between text-sm border-b py-1">
              <span>{[h.business_name, h.email, h.phone, h.domain].filter(Boolean).join(" · ")} {h.note && <span className="text-muted-foreground">— {h.note}</span>}</span>
              <Button size="sm" variant="ghost" onClick={() => delHouse(h.id)}>Remove</Button>
            </div>))}
        </CardContent>
      </Card>
    </div>
  );
}
