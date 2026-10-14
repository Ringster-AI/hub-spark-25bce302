import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, MessageSquarePlus, CalendarPlus } from "lucide-react";
import BookDemoDialog from "./BookDemoDialog";

const db = supabase as any;

export const STATUS_LABEL: Record<string, string> = {
  registered: "Registered", contacted: "Contacted", qualified: "Interested", demo_booked: "Demo booked",
  demo_completed: "Demo completed", signed_up: "Signed up", paying: "Subscribed", lost: "Lost",
};
const PROTECTION_LABEL: Record<string, string> = {
  protected: "Protected", review_needed: "Needs outreach", released: "Released", disputed: "Under review",
};
const PARTNER_STATUSES = ["contacted", "qualified", "lost"];
const EMPTY = {
  business_name: "", contact_name: "", email: "", phone: "", website: "", industry: "",
  street: "", city: "", postal_code: "", location_label: "", purchasing_entity: "unknown", lead_source: "", notes: "",
};

export default function PartnerProspects() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [logFor, setLogFor] = useState<any>(null);
  const [demoFor, setDemoFor] = useState<any>(null);
  const [act, setAct] = useState({ type: "call", summary: "", next_action: "" });

  const { data: prospects = [] } = useQuery({
    queryKey: ["partner-prospects"],
    queryFn: async () => {
      const { data, error } = await db.from("partner_prospects")
        .select("id,business_name,contact_name,city,location_label,status,protection_status,protected_until,activity_deadline,last_contact_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["partner-prospects"] });
    qc.invalidateQueries({ queryKey: ["partner-summary"] });
  };
  const f = (k: keyof typeof EMPTY) => ({
    value: form[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }),
  });

  const register = async () => {
    setSaving(true);
    const { data, error } = await db.rpc("register_partner_prospect", { p: form });
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!data?.ok) return toast.error(data?.message ?? "This prospect is unavailable.");
    toast.success("Prospect registered and protected for 90 days. Log outreach within 14 days to keep it.");
    setForm({ ...EMPTY }); setOpen(false); refresh();
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await db.from("partner_prospects").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const logActivity = async () => {
    if (!act.summary.trim()) return toast.error("Add a short summary");
    const { data: me } = await db.rpc("current_partner_id");
    const { error } = await db.from("partner_activities").insert({
      prospect_id: logFor.id, partner_id: me, type: act.type, summary: act.summary.trim(), next_action: act.next_action || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Activity logged");
    setLogFor(null); setAct({ type: "call", summary: "", next_action: "" }); refresh();
  };

  const days = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Your prospects</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Register prospect</Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Register a business before you approach it. It's protected for 90 days as long as you log real outreach (call, email, text, meeting) at least every 14 days.
        </p>
        {prospects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No prospects yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Business</TableHead><TableHead>Status</TableHead><TableHead>Protection</TableHead>
                <TableHead>Next outreach due</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {prospects.map((p: any) => {
                  const editable = ["registered", "contacted", "qualified", "lost"].includes(p.status);
                  const due = days(p.activity_deadline);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.business_name}</div>
                        <div className="text-xs text-muted-foreground">{[p.location_label, p.city].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Select value={p.status} onValueChange={(v) => setStatus(p.id, v)}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[p.status, ...PARTNER_STATUSES.filter((s) => s !== p.status)].map((s) => (
                                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        ) : <Badge variant="secondary">{STATUS_LABEL[p.status]}</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.protection_status === "protected" ? "default" : "outline"}>{PROTECTION_LABEL[p.protection_status]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.protection_status === "protected" ? (due <= 0 ? "Today" : `${due} day${due === 1 ? "" : "s"}`) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setLogFor(p)}><MessageSquarePlus className="h-4 w-4 mr-1" />Log outreach</Button>
                        {p.protection_status === "protected" && ["registered","contacted","qualified"].includes(p.status) &&
                          <Button size="sm" variant="ghost" onClick={() => setDemoFor(p)}><CalendarPlus className="h-4 w-4 mr-1" />Book demo</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Register a prospect</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2"><Label>Business name *</Label><Input {...f("business_name")} /></div>
            <div className="space-y-1"><Label>Contact name</Label><Input {...f("contact_name")} /></div>
            <div className="space-y-1"><Label>Industry</Label><Input {...f("industry")} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" {...f("email")} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input {...f("phone")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Website</Label><Input placeholder="example.com" {...f("website")} /></div>
            <div className="space-y-1"><Label>Street address</Label><Input {...f("street")} /></div>
            <div className="space-y-1"><Label>City *</Label><Input {...f("city")} /></div>
            <div className="space-y-1"><Label>Postal code</Label><Input {...f("postal_code")} /></div>
            <div className="space-y-1"><Label>Location name (if several)</Label><Input placeholder="e.g. Downtown" {...f("location_label")} /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Who decides on the purchase?</Label>
              <Select value={form.purchasing_entity} onValueChange={(v) => setForm({ ...form, purchasing_entity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">This location buys on its own</SelectItem>
                  <SelectItem value="parent_controlled">Head office / parent company decides</SelectItem>
                  <SelectItem value="unknown">Not sure yet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>How did you find them?</Label><Input {...f("lead_source")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Notes</Label><Textarea rows={3} {...f("notes")} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Add at least an email, phone or website. Only contact businesses in line with the outreach rules in your partner agreement.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.business_name.trim() || !form.city.trim()} onClick={register}>{saving ? "Checking…" : "Register"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log outreach — {logFor?.business_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={act.type} onValueChange={(v) => setAct({ ...act, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Phone call</SelectItem><SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">Text message</SelectItem><SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="note">Note only (doesn't extend protection)</SelectItem>
              </SelectContent>
            </Select>
            <Textarea rows={3} placeholder="What happened?" value={act.summary} onChange={(e) => setAct({ ...act, summary: e.target.value })} />
            <Input placeholder="Next step (optional)" value={act.next_action} onChange={(e) => setAct({ ...act, next_action: e.target.value })} />
          </div>
          <DialogFooter><Button onClick={logActivity}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <BookDemoDialog prospect={demoFor} onClose={() => setDemoFor(null)} onBooked={refresh} />
    </Card>
  );
}
