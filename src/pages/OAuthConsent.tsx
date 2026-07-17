import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

// Minimal typed wrapper — supabase.auth.oauth is beta and may not be in generated types.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

function getOAuthApi(): OAuthApi | null {
  const anyAuth = (supabase.auth as unknown) as { oauth?: OAuthApi };
  return anyAuth.oauth ?? null;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const oauth = getOAuthApi();
      if (!oauth) {
        setError(
          "OAuth 2.1 authorization server is not enabled on this Supabase project. Enable it in the Supabase dashboard, then try again."
        );
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    const oauth = getOAuthApi();
    if (!oauth) return;
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-sm text-white/70 mb-6">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          Ringster
        </div>
        {error ? (
          <>
            <h1 className="text-xl font-semibold">Authorization error</h1>
            <p className="mt-3 text-sm text-white/70">{error}</p>
          </>
        ) : !details ? (
          <div className="flex items-center gap-2 text-white/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization…
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              Connect {details.client?.name ?? "an app"} to your Ringster account
            </h1>
            <p className="mt-3 text-sm text-white/70">
              This lets {details.client?.name ?? "the client"} use Ringster tools (list your
              agents, view configurations, and read call logs) as you.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                className="flex-1"
                size="lg"
                disabled={busy}
                onClick={() => decide(true)}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Deny
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
