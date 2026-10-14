import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const db = supabase as any;

const money = (cents: number | null | undefined, currency?: string) =>
  `${(currency ?? "usd").toUpperCase()} ${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null | undefined) => `${((v ?? 0) * 100).toFixed(0)}%`;

export default function AdminPartnerReporting({ partners }: { partners: { id: string; display_name: string }[] }) {
  const [partnerId, setPartnerId] = useState<string>("all");

  const { data: rows = [] } = useQuery({
    queryKey: ["partner-report", partnerId],
    queryFn: async () => {
      const { data, error } = await db.rpc("partner_report", {
        p_partner: partnerId === "all" ? null : partnerId,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: monthly = [] } = useQuery({
    queryKey: ["partner-report-monthly", partnerId],
    queryFn: async () => {
      const { data, error } = await db.rpc("partner_report_monthly", {
        p_partner: partnerId === "all" ? null : partnerId,
        p_months: 6,
      });
      if (error) throw error;
      return data as { month: string; collected_revenue_cents: number; commission_cents: number; new_customers: number }[];
    },
  });

  const cur = rows[0]?.currency ?? "usd";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Reporting</CardTitle>
        <Select value={partnerId} onValueChange={setPartnerId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All partners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All partners</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.display_name || p.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Partner</TableHead>
            <TableHead>Customers</TableHead>
            <TableHead>Retention</TableHead>
            <TableHead>Collected revenue</TableHead>
            <TableHead>Net commission</TableHead>
            <TableHead>Pending</TableHead>
            <TableHead>Commission %</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.partner_id}>
                <TableCell className="font-medium">{r.business_name}</TableCell>
                <TableCell>
                  {r.credited_customers} total
                  <div className="text-xs text-muted-foreground">{r.active_customers} active · {r.churned_customers} churned</div>
                </TableCell>
                <TableCell>{pct(r.retention_rate)}</TableCell>
                <TableCell>{money(r.collected_revenue_cents, r.currency)}</TableCell>
                <TableCell>{money(r.net_commission_cents, r.currency)}</TableCell>
                <TableCell>{money(r.pending_commission_cents, r.currency)}</TableCell>
                <TableCell>{pct(r.commission_ratio)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nothing to report yet.</TableCell></TableRow>}
          </TableBody>
        </Table>

        {monthly.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Last 6 months</h3>
            <div className="flex items-end gap-2 h-32">
              {(() => {
                const max = Math.max(1, ...monthly.map((m) => Math.max(m.collected_revenue_cents, 0)));
                return monthly.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1" title={`${m.month}: ${money(m.collected_revenue_cents, cur)} revenue, ${money(m.commission_cents, cur)} commission, ${m.new_customers} new customers`}>
                    <div className="w-full bg-primary/20 rounded-t relative" style={{ height: `${Math.max(4, (Math.max(m.collected_revenue_cents, 0) / max) * 100)}%` }}>
                      <div className="absolute bottom-0 left-0 w-full bg-primary rounded-t" style={{ height: `${m.collected_revenue_cents > 0 ? Math.max(8, (Math.abs(m.commission_cents) / Math.max(m.collected_revenue_cents, 1)) * 100) : 0}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{m.month.slice(5)}</span>
                  </div>
                ));
              })()}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Bar = collected revenue; darker portion = commission. Revenue can be negative when refunds exceed payments in a month.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
