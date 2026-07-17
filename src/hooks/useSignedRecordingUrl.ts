import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getNetlifyFunctionsUrl } from "@/utils/netlifyFunctions";

export type RecordingKind =
  | "mono-recording"
  | "stereo-recording"
  | "customer-recording"
  | "assistant-recording"
  | "video-recording";

/**
 * Fetches a short-lived signed URL for a Vapi call recording via our
 * `get-vapi-recording` Netlify function.
 *
 * Vapi no longer allows anonymous downloads of `storage.vapi.ai` URLs, so
 * we can't render `recording_url` directly in <audio> anymore — we have to
 * exchange the call_log_id for a freshly signed URL each time playback is
 * requested. Cached for 4 minutes (Vapi signatures are short-lived).
 */
export function useSignedRecordingUrl(
  callLogId: string | null | undefined,
  options: { enabled?: boolean; kind?: RecordingKind } = {}
) {
  const kind = options.kind ?? "mono-recording";
  return useQuery({
    queryKey: ["signed-recording-url", callLogId, kind],
    enabled: !!callLogId && (options.enabled ?? true),
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<string> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const res = await fetch(getNetlifyFunctionsUrl("get-vapi-recording"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ call_log_id: callLogId, kind }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Recording unavailable (${res.status}) ${text}`);
      }

      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("No signed URL returned");
      return json.url;
    },
  });
}
