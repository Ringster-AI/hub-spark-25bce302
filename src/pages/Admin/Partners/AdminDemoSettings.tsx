import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { callDemos } from "@/pages/Partner/BookDemoDialog";

const db = supabase as any;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AdminDemoSettings() {
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["partner-demo-settings"],
    queryFn: async () => (await db.from("partner_demo_settings").select("*").eq("id", true).single()).data,
  });
  const { data: demos = [] } = useQuery({
    queryKey: ["admin-partner-demos"],
    queryFn: async () => (await db.from("partner_demos")
      .select("id,slot_start,status,partner:partners(display_name),prospect:partner_prospects(business_name)")
      .in("status", ["booked", "completed", "no_show"]).order("slot_start", { ascending: false }).limit(50)).data ?? [],
  });
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (s) setForm(s); }, [s]);

  const save = async () => {
    const { error } = await db.from("partner_demo_settings").update({
      duration_min: +form.duration_min, buffer_min: +form.buffer_min, min_notice_hours: +form.min_notice_hours,
      window_days: +form.window_days, working_days: form.working_days, working_start: form.working_start,
      working_end: form.working_end, timezone: form.timezone, updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) toast.error(error.message); else { toast.success("Demo settings saved"); qc.invalidateQueries({ queryKey: ["partner-demo-settings"] }); }
  };
  const connect = async () => {
    try { const r = await callDemos({ action: "use_my_calendar" }); toast.success(`Demos will book into ${r.email}`); qc.invalidateQueries({ queryKey: ["partner-demo-settings"] }); }
    catch (e: any) { toast.error(e.message); }
  };
  const mark = async (id: string, status: string) => {
    const { error } = await db.rpc("admin_set_demo_outcome", { p_demo: id, p_status: status });
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["admin-partner-demos"] });
  };

  if (!form) return null;
  const n = (k: string) => ({ value: form[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <Card>
      <CardHeader><CardTitle>Demo scheduler</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant={form.google_integration_id ? "default" : "outline"}>
            {form.google_integration_id ? "Calendar connected" : "No calendar"}
          </Badge>
          <Button size="sm" variant="outline" onClick={connect}>Use my Google Calendar</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Length (min)</Label><Input type="number" {...n("duration_min")} /></div>
          <div><Label>Buffer (min)</Label><Input type="number" {...n("buffer_min")} /></div>
          <div><Label>Min notice (hours)</Label><Input type="number" {...n("min_notice_hours")} /></div>
          <div><Label>Days ahead</Label><Input type="number" {...n("window_days")} /></div>
          <div><Label>Start</Label><Input type="time" {...n("working_start")} /></div>
          <div><Label>End</Label><Input type="time" {...n("working_end")} /></div>
          <div className="col-span-2"><Label>Time zone</Label><Input {...n("timezone")} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = form.working_days.includes(i + 1);
            return <Button key={d} size="sm" variant={on ? "default" : "outline"} onClick={() => setForm({
              ...form, working_days: on ? form.working_days.filter((x: number) => x !== i + 1) : [...form.working_days, i + 1].sort(),
            })}>{d}</Button>;
          })}
        </div>
        <Button onClick={save}>Save settings</Button>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Prospect</TableHead><TableHead>Partner</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {demos.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell>{new Date(d.slot_start).toLocaleString()}</TableCell>
                <TableCell>{d.prospect?.business_name}</TableCell>
                <TableCell>{d.partner?.display_name}</TableCell>
                <TableCell><Badge variant="outline">{d.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {d.status === "booked" && new Date(d.slot_start) < new Date() && <>
                    <Button size="sm" variant="ghost" onClick={() => mark(d.id, "completed")}>Completed</Button>
                    <Button size="sm" variant="ghost" onClick={() => mark(d.id, "no_show")}>No-show</Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
            {demos.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No demos yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
