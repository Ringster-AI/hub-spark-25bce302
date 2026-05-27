import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentForm } from "@/components/agents/AgentForm";
import { AgentFormData } from "@/types/agents";
import { AgentConfig } from "@/types/database/agents";
import { VapiAssistantUpdateService } from "@/services/vapi/assistant-update-service";
import {
  generateToolInstructions,
  appendToolInstructionsToDescription,
} from "@/utils/agentDescriptionUtils";

const parseObj = (data: any) => {
  if (!data) return {};
  if (typeof data === "object") return data;
  try { return JSON.parse(data); } catch { return {}; }
};

export const AdminAgentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["admin-agent", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configs")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as AgentConfig;
    },
    enabled: !!id,
  });

  const { data: owner } = useQuery({
    queryKey: ["admin-agent-owner", agent?.user_id],
    queryFn: async () => {
      if (!agent?.user_id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", agent.user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!agent?.user_id,
  });

  const { data: recentCalls } = useQuery({
    queryKey: ["admin-agent-calls", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("id, call_sid, from_number, to_number, duration, status, start_time")
        .eq("agent_id", id!)
        .order("start_time", { ascending: false, nullsFirst: false })
        .limit(20);
      return data || [];
    },
    enabled: !!id,
  });

  const parsedConfig = useMemo(() => parseObj(agent?.config), [agent?.config]);
  const parsedAdvanced = useMemo(() => parseObj(agent?.advanced_config), [agent?.advanced_config]);
  const parsedTransfer = useMemo(() => parseObj(agent?.transfer_directory), [agent?.transfer_directory]);

  const form = useForm<AgentFormData>({
    values: agent
      ? {
          name: agent.name || "",
          description: agent.description || "",
          greeting: agent.greeting || "",
          goodbye: agent.goodbye || "",
          voice_id: agent.voice_id || "",
          phone_number: agent.phone_number || "",
          transfer_directory: parsedTransfer,
          hipaa_enabled: false,
          agent_type: agent.agent_type || "inbound",
          advanced_config: parsedAdvanced as any,
          config: parsedConfig as any,
          calendar_booking: (parsedConfig as any)?.calendar_booking || {
            enabled: false,
            default_duration: 30,
            buffer_time: 10,
            business_hours_start: "09:00",
            business_hours_end: "17:00",
            booking_lead_time_hours: 2,
            require_phone_verification: true,
          },
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: AgentFormData) => {
      if (!agent) throw new Error("No agent loaded");
      const toolInstructions = generateToolInstructions(formData);
      const enhancedDescription = appendToolInstructionsToDescription(
        formData.description,
        toolInstructions
      );

      const updateData = {
        name: formData.name,
        description: enhancedDescription,
        greeting: formData.greeting,
        goodbye: formData.goodbye,
        voice_id: formData.voice_id,
        phone_number: formData.phone_number,
        transfer_directory: formData.transfer_directory as any,
        agent_type: formData.agent_type || "inbound",
        advanced_config: formData.advanced_config as any,
        config: {
          ...parsedConfig,
          ...formData.config,
          calendar_booking: formData.calendar_booking,
        } as any,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("agent_configs")
        .update(updateData)
        .eq("id", agent.id);
      if (error) throw error;

      if (formData.calendar_booking?.enabled) {
        await supabase.from("calendar_tools").upsert(
          {
            agent_id: agent.id,
            tool_name: "calendar_booking",
            is_enabled: true,
            configuration: {
              default_duration: formData.calendar_booking.default_duration || 30,
              buffer_time: formData.calendar_booking.buffer_time || 10,
              business_hours_start: formData.calendar_booking.business_hours_start || "09:00",
              business_hours_end: formData.calendar_booking.business_hours_end || "17:00",
              booking_lead_time_hours: formData.calendar_booking.booking_lead_time_hours || 2,
              require_phone_verification: formData.calendar_booking.require_phone_verification ?? true,
            },
          },
          { onConflict: "agent_id,tool_name" }
        );
      } else {
        await supabase
          .from("calendar_tools")
          .update({ is_enabled: false })
          .eq("agent_id", agent.id)
          .eq("tool_name", "calendar_booking");
      }
    },
    onSuccess: () => {
      toast({ title: "Agent updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-agent", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e: any) =>
      toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const resyncMutation = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error("No agent");
      await VapiAssistantUpdateService.syncAgentWithVapi(agent.id);
    },
    onSuccess: () => toast({ title: "Re-synced with Vapi" }),
    onError: (e: any) =>
      toast({ title: "Re-sync failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !agent) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-muted-foreground">Loading agent…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/agents")} className="-ml-2 mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> All agents
          </Button>
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            Owner: {owner?.full_name || "—"}{" "}
            <span className="text-xs">({owner?.email || agent.user_id})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={agent.status === "active" ? "default" : "secondary"} className="capitalize">
            {agent.status}
          </Badge>
          <Badge variant="outline" className="capitalize">{agent.agent_type}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <AgentForm
                form={form}
                onSubmit={async (data) => updateMutation.mutate(data)}
                onCancel={() => navigate("/admin/agents")}
                canCustomizeVoice={() => true}
                disabled={updateMutation.isPending}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent calls</CardTitle>
            </CardHeader>
            <CardContent>
              {!recentCalls || recentCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No calls recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentCalls.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-sm border-b last:border-b-0 py-2"
                    >
                      <div>
                        <div className="font-mono text-xs text-muted-foreground">{c.call_sid}</div>
                        <div>
                          {c.from_number || "—"} → {c.to_number || "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="capitalize">{c.status || "unknown"}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.duration ?? 0}s ·{" "}
                          {c.start_time ? new Date(c.start_time).toLocaleString() : "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Vapi assistant</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resyncMutation.mutate()}
                disabled={resyncMutation.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
                Re-sync
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Assistant ID" value={agent.vapi_assistant_id} mono />
              {agent.vapi_assistant_id && (
                <a
                  href={`https://dashboard.vapi.ai/assistants/${agent.vapi_assistant_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open in Vapi <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Twilio number</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Field label="Phone" value={agent.phone_number} />
              <Field label="Twilio SID" value={agent.twilio_sid} mono />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfer directory</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(parsedTransfer).length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfer destinations.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {Object.entries(parsedTransfer).map(([name, entry]: [string, any]) => (
                    <li key={name} className="flex justify-between">
                      <span className="font-medium">{name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{entry?.number}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <div>Created: {agent.created_at ? new Date(agent.created_at).toLocaleString() : "—"}</div>
              <div>Updated: {agent.updated_at ? new Date(agent.updated_at).toLocaleString() : "—"}</div>
              <div className="font-mono">{agent.id}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className={mono ? "font-mono text-xs truncate max-w-[200px]" : ""}>
      {value || "—"}
    </span>
  </div>
);

export default AdminAgentDetail;
