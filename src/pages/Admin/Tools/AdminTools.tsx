import { useState } from "react";
import { Wrench, Play, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type BackfillResult = {
  agentId: string;
  vapiAssistantId: string;
  status: "ok" | "skipped" | "error";
  message?: string;
};

type BackfillResponse = {
  success: boolean;
  dryRun: boolean;
  summary: { total: number; ok: number; errors: number; skipped: number };
  results: BackfillResult[];
};

export const AdminTools = () => {
  const [loading, setLoading] = useState<"dry" | "run" | null>(null);
  const [response, setResponse] = useState<BackfillResponse | null>(null);

  const run = async (dryRun: boolean) => {
    setLoading(dryRun ? "dry" : "run");
    setResponse(null);
    try {
      const { data, error } = await supabase.functions.invoke<BackfillResponse>(
        "backfill-vapi-server-secret",
        { body: { dryRun } }
      );
      if (error) throw error;
      if (!data) throw new Error("Empty response");
      setResponse(data);
      toast({
        title: dryRun ? "Dry run complete" : "Backfill complete",
        description: `${data.summary.ok} ok · ${data.summary.errors} errors · ${data.summary.skipped} skipped (of ${data.summary.total})`,
      });
    } catch (err: any) {
      toast({
        title: "Backfill failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const statusVariant = (s: BackfillResult["status"]) =>
    s === "ok" ? "default" : s === "error" ? "destructive" : "secondary";

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          Admin Tools
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          One-off maintenance actions. Admin only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vapi Assistant Backfill</CardTitle>
          <CardDescription>
            Pushes the current <code>VAPI_SERVER_SECRET</code> and webhook URL onto every
            existing Vapi assistant. Run once after rotating the secret or after enabling
            signed webhooks so call lifecycle events (recordings, credits, Live Coach) keep
            working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => run(true)}
              disabled={loading !== null}
            >
              {loading === "dry" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Dry run
            </Button>
            <Button onClick={() => run(false)} disabled={loading !== null}>
              {loading === "run" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run backfill
            </Button>
          </div>

          {response && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">Total: {response.summary.total}</Badge>
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  OK: {response.summary.ok}
                </Badge>
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Errors: {response.summary.errors}
                </Badge>
                <Badge variant="secondary">Skipped: {response.summary.skipped}</Badge>
                {response.dryRun && <Badge variant="outline">Dry run</Badge>}
              </div>

              <ScrollArea className="h-80 border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Agent ID</th>
                      <th className="px-3 py-2 font-medium">Vapi Assistant</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((r) => (
                      <tr key={r.agentId} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{r.agentId}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.vapiAssistantId}</td>
                        <td className="px-3 py-2">
                          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.message || "—"}</td>
                      </tr>
                    ))}
                    {response.results.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                          No agents found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTools;
