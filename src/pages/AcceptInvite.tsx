import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"checking" | "needs_auth" | "accepting" | "ok" | "error">("checking");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing invite token.");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("needs_auth");
        return;
      }
      setStatus("accepting");
      const { data, error } = await supabase.functions.invoke("accept-team-invite", { body: { token } });
      if (error || (data as any)?.error) {
        setStatus("error");
        setMessage((data as any)?.error ?? error?.message ?? "Could not accept invite");
        return;
      }
      setStatus("ok");
      setTimeout(() => navigate("/dashboard/team"), 1500);
    })();
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Team invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "checking" && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking invite…</div>}
          {status === "accepting" && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Accepting…</div>}
          {status === "needs_auth" && (
            <>
              <p className="text-sm text-muted-foreground">Sign in or create an account to accept this invitation.</p>
              <div className="flex gap-2">
                <Button onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/team/accept-invite?token=${token}`)}`)}>Sign in</Button>
                <Button variant="outline" onClick={() => navigate(`/signup?redirect=${encodeURIComponent(`/team/accept-invite?token=${token}`)}`)}>Create account</Button>
              </div>
            </>
          )}
          {status === "ok" && (
            <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-5 w-5" /> Invite accepted. Redirecting…</div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 text-destructive"><AlertCircle className="h-5 w-5 mt-0.5" /><span className="text-sm">{message}</span></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
