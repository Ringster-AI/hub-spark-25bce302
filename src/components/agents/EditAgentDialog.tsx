
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentConfig } from "@/types/database/agents";
import { AgentForm } from "./AgentForm";
import { useForm } from "react-hook-form";
import { AgentFormData } from "@/types/agents";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionFeatures } from "@/hooks/useSubscriptionFeatures";
import { generateToolInstructions, appendToolInstructionsToDescription } from "@/utils/agentDescriptionUtils";
import { VapiAssistantUpdateService } from "@/services/vapi/assistant-update-service";

interface EditAgentDialogProps {
  agent: AgentConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditAgentDialog = ({ agent, open, onOpenChange }: EditAgentDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { features } = useSubscriptionFeatures();

  // Safely parse JSON fields with proper type casting
  const parseTransferDirectory = (data: any) => {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  };

  const parseAdvancedConfig = (data: any) => {
    if (!data) return undefined;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  };

  const parseConfig = (data: any) => {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  };

  const parsedConfig = parseConfig(agent.config);
  const parsedAdvancedConfig = parseAdvancedConfig(agent.advanced_config);

  const form = useForm<AgentFormData>({
    defaultValues: {
      name: agent.name || "",
      description: agent.description || "",
      greeting: agent.greeting || "",
      goodbye: agent.goodbye || "",
      voice_id: agent.voice_id || "",
      phone_number: agent.phone_number || "",
      transfer_directory: parseTransferDirectory(agent.transfer_directory),
      hipaa_enabled: false, // Default value since this field doesn't exist on AgentConfig
      agent_type: agent.agent_type || 'inbound',
      advanced_config: parsedAdvancedConfig,
      config: parsedConfig,
      calendar_booking: parsedConfig?.calendar_booking || {
        enabled: false,
        default_duration: 30,
        buffer_time: 10,
        business_hours_start: "09:00",
        business_hours_end: "17:00",
        booking_lead_time_hours: 2,
        require_phone_verification: true
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (formData: AgentFormData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      // Generate tool instructions and append to description
      const toolInstructions = generateToolInstructions(formData);
      const enhancedDescription = appendToolInstructionsToDescription(formData.description, toolInstructions);

      // Prepare update data with proper JSON conversion
      const updateData = {
        name: formData.name,
        description: enhancedDescription,
        greeting: formData.greeting,
        goodbye: formData.goodbye,
        voice_id: formData.voice_id,
        phone_number: formData.phone_number,
        transfer_directory: formData.transfer_directory as any,
        agent_type: formData.agent_type || 'inbound',
        advanced_config: formData.advanced_config as any,
        config: {
          ...parsedConfig,
          ...formData.config,
          calendar_booking: formData.calendar_booking
        } as any,
        updated_at: new Date().toISOString()
      };

      const { data: updatedAgent, error } = await supabase
        .from("agent_configs")
        .update(updateData)
        .eq("id", agent.id)
        .eq("user_id", session.user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating agent:", error);
        throw error;
      }

      // Handle calendar booking tools
      if (formData.calendar_booking?.enabled) {
        const calendarToolConfig = {
          agent_id: agent.id,
          tool_name: 'calendar_booking',
          is_enabled: true,
          configuration: {
            default_duration: formData.calendar_booking.default_duration || 30,
            buffer_time: formData.calendar_booking.buffer_time || 10,
            business_hours_start: formData.calendar_booking.business_hours_start || '09:00',
            business_hours_end: formData.calendar_booking.business_hours_end || '17:00',
            booking_lead_time_hours: formData.calendar_booking.booking_lead_time_hours || 2,
            require_phone_verification: formData.calendar_booking.require_phone_verification ?? true
          }
        };

        const { error: toolError } = await supabase
          .from("calendar_tools")
          .upsert(calendarToolConfig, { onConflict: "agent_id,tool_name" });

        if (toolError) {
          console.error("Error updating calendar tool:", toolError);
        }
      } else {
        // Disable calendar tool if it exists
        await supabase
          .from("calendar_tools")
          .update({ is_enabled: false })
          .eq("agent_id", agent.id)
          .eq("tool_name", "calendar_booking");
      }

      // Sync with VAPI assistant
      try {
        await VapiAssistantUpdateService.syncAgentWithVapi(agent.id);
        console.log("Successfully synced agent with VAPI assistant");
      } catch (vapiError) {
        console.error("Failed to sync with VAPI assistant:", vapiError);
        // Don't throw here as the main operation succeeded
      }

      return updatedAgent;
    },
    onSuccess: () => {
      toast({
        title: "Agent updated successfully",
        description: "Your AI agent has been updated with the new settings and tool instructions.",
      });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Error updating agent:", error);
      toast({
        title: "Failed to update agent",
        description: error.message || "An error occurred while updating the agent.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (data: AgentFormData) => {
    updateMutation.mutate(data);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (updateMutation.isPending) return; onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
        </DialogHeader>
        <AgentForm
          form={form}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          canCustomizeVoice={() => features.limits.canCustomizeVoices}
          disabled={false}
          isSubmitting={updateMutation.isPending}
          submitLabel="Save Changes"
          submittingLabel="Saving changes..."
        />
      </DialogContent>
    </Dialog>
  );
};
