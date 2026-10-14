import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export async function callDemos(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("partner-demos", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return data;
}

export default function BookDemoDialog({ prospect, onClose, onBooked }: {
  prospect: any | null; onClose: () => void; onBooked: () => void;
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [tz, setTz] = useState("");
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prospect) return;
    setPick(null); setNotes(""); setLoading(true);
    callDemos({ action: "slots" })
      .then((d) => { setSlots(d.slots); setTz(d.timezone); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [prospect]);

  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) {
      const day = new Date(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: tz || undefined });
      m.set(day, [...(m.get(day) ?? []), s]);
    }
    return [...m.entries()];
  }, [slots, tz]);

  const book = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      await callDemos({ action: "book", prospect_id: prospect.id, slot_start: pick, notes });
      toast.success("Demo booked. Invites have been sent.");
      onBooked(); onClose();
    } catch (e: any) {
      toast.error(e.message);
      if (/available|taken/.test(e.message)) callDemos({ action: "slots" }).then((d) => setSlots(d.slots)).catch(() => {});
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!prospect} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Book a demo — {prospect?.business_name}</DialogTitle></DialogHeader>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {tz && <p className="text-xs text-muted-foreground">Times shown in {tz}.</p>}
            {byDay.length === 0 && <p className="text-sm text-muted-foreground">No open times right now.</p>}
            {byDay.map(([day, list]) => (
              <div key={day}>
                <p className="text-sm font-medium mb-1">{day}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <Button key={s} size="sm" variant={pick === s ? "default" : "outline"} onClick={() => setPick(s)}>
                      {new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz || undefined })}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1">
          <Label>Notes for the demo (optional)</Label>
          <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={!pick || saving} onClick={book}>{saving ? "Booking…" : "Book demo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
