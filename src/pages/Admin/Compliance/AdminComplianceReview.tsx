import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";

type Level = "low" | "medium" | "high";
interface Finding {
  category: "consent" | "disclosure" | "do_not_call" | "other";
  severity: Level;
  title: string;
  evidence: string;
  explanation: string;
  recommendation: string;
}
interface Review {
  overall_risk: Level;
  summary: string;
  findings: Finding[];
  positive_practices: string[];
}

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  consent: "Consent",
  disclosure: "Disclosure",
  do_not_call: "Do Not Call",
  other: "Other",
};

const levelVariant = (l: Level) => (l === "high" ? "destructive" : l === "medium" ? "default" : "secondary");

async function readSseText(res: Response, onProgress: (chars: number) => void): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const data = evt.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      let parsed: any;
      try { parsed = JSON.parse(data); } catch { continue; }
      if (parsed.type === "response.output_text.delta") {
        text += parsed.delta ?? "";
        onProgress(text.length);
      } else if (parsed.type === "error" || parsed.type === "response.failed") {
        throw new Error(parsed.error?.message || parsed.response?.error?.message || "AI analysis failed.");
      } else if (parsed.type === "response.refusal.delta") {
        throw new Error("The model declined to analyze this transcript.");
      }
    }
  }
  return text;
}

export default function AdminComplianceReview() {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = async () => {
    setLoading(true); setError(null); setReview(null); setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-call-compliance`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const text = await readSseText(res, setProgress);
      if (!text.trim()) throw new Error("The model returned an empty result.");
      setReview(JSON.parse(text));
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Analysis failed.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" /> Compliance review
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a call transcript to screen for consent, disclosure, and Do Not Call risks. This is an AI risk screen, not legal advice.
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={"Agent: Hi, this is Sam from Acme Roofing...\nCustomer: ..."}
          className="min-h-[260px] font-mono text-sm"
          maxLength={60000}
        />
        <div className="flex items-center gap-3">
          <Button onClick={analyze} disabled={loading || transcript.trim().length < 20}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Analyzing…" : "Analyze transcript"}
          </Button>
          {loading && (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>Stop</Button>
          )}
          {loading && progress > 0 && <span className="text-xs text-muted-foreground">Receiving results…</span>}
          <span className="text-xs text-muted-foreground ml-auto">{transcript.length.toLocaleString()} / 60,000</span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {review && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Overall risk</CardTitle>
              <Badge variant={levelVariant(review.overall_risk)} className="uppercase">{review.overall_risk}</Badge>
            </CardHeader>
            <CardContent><p className="text-sm">{review.summary}</p></CardContent>
          </Card>

          {review.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No compliance risks identified.</p>
          ) : (
            review.findings.map((f, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{CATEGORY_LABEL[f.category]}</Badge>
                    <Badge variant={levelVariant(f.severity)} className="uppercase">{f.severity}</Badge>
                  </div>
                  <CardTitle className="text-base pt-1">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {f.evidence && (
                    <blockquote className="border-l-2 pl-3 italic text-muted-foreground">“{f.evidence}”</blockquote>
                  )}
                  <p>{f.explanation}</p>
                  <p><span className="font-medium">Recommendation:</span> {f.recommendation}</p>
                </CardContent>
              </Card>
            ))
          )}

          {review.positive_practices.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">What went well</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {review.positive_practices.map((p, i) => (
                    <li key={i} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
