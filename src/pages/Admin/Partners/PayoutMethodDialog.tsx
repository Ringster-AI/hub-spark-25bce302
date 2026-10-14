import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const PAYOUT_LABELS: Record<string, string> = {
  interac_etransfer: "Interac e-transfer",
  wise: "Wise",
  paypal: "PayPal",
  wire: "Wire transfer",
};

export function PayoutMethodDialog({ partner, onSaved }: { partner: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(partner.country ?? "CA");
  const [method, setMethod] = useState(partner.payout_method ?? "interac_etransfer");
  const [contact, setContact] = useState(partner.payout_contact ?? "");
  const [busy, setBusy] = useState(false);
  const isCA = country.trim().toUpperCase() === "CA";

  const save = async () => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("admin_set_partner_payout", {
      p_partner_id: partner.id, p_country: country, p_method: method, p_contact: contact,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Payout method approved");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">{partner.payout_method ? "Edit payout" : "Set payout"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Payout method: {partner.display_name ?? partner.invite_email}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Country (2-letter code)</Label>
            <Input maxLength={2} value={country} onChange={(e) => {
              const v = e.target.value.toUpperCase(); setCountry(v);
              if (v === "CA") setMethod("interac_etransfer");
              else if (method === "interac_etransfer") setMethod("wise");
            }} />
          </div>
          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAYOUT_LABELS).filter(([k]) => isCA ? k === "interac_etransfer" : k !== "interac_etransfer")
                  .map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{method === "interac_etransfer" ? "E-transfer email" : "Account reference"}</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy || !contact.trim()}>{busy ? "Saving…" : "Approve method"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
