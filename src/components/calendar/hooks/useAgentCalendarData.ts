
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AgentFormData } from "@/types/agents";
import { generateToolInstructions, appendToolInstructionsToDescription } from "@/utils/agentDescriptionUtils";
import { VapiAssistantUpdateService } from "@/services/vapi/assistant-update-service";

// Ensure global calendar tools are registered in Vapi
async function ensureCalendarToolsRegistered(): Promise<void> {
  // Check if tools already exist by calling the registration endpoint
  // It handles idempotency internally
  console.log("Ensuring calendar tools are registered...");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/register-vapi-calendar-tools`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Registration failed" }));
    throw new Error(err.error || "Failed to register calendar tools");
  }

  console.log("Calendar tools registered successfully");
}

export const useAgentCalendarData = (agentId: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch agent data
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_configs")
        .select("*")
        .eq("id", agentId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch calendar tools data
  const { data: calendarTool, isLoading: toolLoading } = useQuery({
    queryKey: ["calendar-tool", agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_tools")
        .select("*")
        .eq("agent_id", agentId)
        .eq("tool_name", "calendar_booking")
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  // Toggle calendar booking
  const toggleMutation = useMutation({
    mutationFn: async ({ enabled, formData }: { enabled: boolean; formData: AgentFormData }) => {
      if (enabled) {
        // Ensure global calendar tools are registered in Vapi
        await ensureCalendarToolsRegistered();

        // Create or enable calendar tool
        const toolConfig = {
          agent_id: agentId,
          tool_name: 'calendar_booking',
          is_enabled: true,
          configuration: {
            default_duration: formData.calendar_booking?.default_duration || 30,
            buffer_time: formData.calendar_booking?.buffer_time || 10,
            business_hours_start: formData.calendar_booking?.business_hours_start || "09:00",
            business_hours_end: formData.calendar_booking?.business_hours_end || "17:00",
            booking_lead_time_hours: formData.calendar_booking?.booking_lead_time_hours || 2,
            require_phone_verification: formData.calendar_booking?.require_phone_verification ?? true,
            calendar_id: formData.calendar_booking?.calendar_id || null,
            calendar_name: formData.calendar_booking?.calendar_name || null,
            calendar_provider: formData.calendar_booking?.calendar_provider || null,
            required_fields: formData.calendar_booking?.required_fields || [],
            custom_fields: formData.calendar_booking?.custom_fields || [],
          }

        };

        const { error } = await supabase
          .from("calendar_tools")
          .upsert(toolConfig, { onConflict: "agent_id,tool_name" });

        if (error) throw error;
      } else {
        // Disable calendar tool
        const { error } = await supabase
          .from("calendar_tools")
          .update({ is_enabled: false })
          .eq("agent_id", agentId)
          .eq("tool_name", "calendar_booking");

        if (error) throw error;
      }

      // Update agent config and description with tool instructions
      const currentConfig = agent?.config ? 
        (typeof agent.config === 'object' ? agent.config : JSON.parse(agent.config as string)) : {};
      
      const enhancedFormData = {
        ...formData,
        calendar_booking: {
          ...formData.calendar_booking,
          enabled
        },
        transfer_directory: agent?.transfer_directory ? 
          (typeof agent.transfer_directory === 'object' ? agent.transfer_directory : JSON.parse(agent.transfer_directory as string)) : {},
        description: agent?.description || ""
      };

      // Generate tool instructions and update description
      const toolInstructions = generateToolInstructions(enhancedFormData);
      const enhancedDescription = appendToolInstructionsToDescription(enhancedFormData.description, toolInstructions);
      
      const { error: agentError } = await supabase
        .from("agent_configs")
        .update({
          description: enhancedDescription,
          config: {
            ...currentConfig,
            calendar_booking: {
              ...formData.calendar_booking,
              enabled
            }
          } as any
        })
        .eq("id", agentId);

      if (agentError) throw agentError;

      // Sync with VAPI assistant
      try {
        await VapiAssistantUpdateService.syncAgentWithVapi(agentId);
        console.log("Successfully synced agent with VAPI assistant");
      } catch (vapiError) {
        console.error("Failed to sync with VAPI assistant:", vapiError);
        // Don't throw here as the main operation succeeded
      }
    },
    onSuccess: () => {
      toast({
        title: "Calendar booking updated",
        description: "Calendar booking settings and agent instructions have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["calendar-tool", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
    onError: (error: any) => {
      console.error("Error updating calendar booking:", error);
      toast({
        title: "Update failed",
        description: error.message || "Failed to update calendar booking settings.",
        variant: "destructive",
      });
    },
  });

  // Save configuration
  const saveMutation = useMutation({
    mutationFn: async (data: AgentFormData) => {
      const { error: toolError } = await supabase
        .from("calendar_tools")
        .update({
          configuration: {
            default_duration: data.calendar_booking?.default_duration || 30,
            buffer_time: data.calendar_booking?.buffer_time || 10,
            business_hours_start: data.calendar_booking?.business_hours_start || "09:00",
            business_hours_end: data.calendar_booking?.business_hours_end || "17:00",
            booking_lead_time_hours: data.calendar_booking?.booking_lead_time_hours || 2,
            require_phone_verification: data.calendar_booking?.require_phone_verification ?? true,
            calendar_id: data.calendar_booking?.calendar_id || null,
            calendar_name: data.calendar_booking?.calendar_name || null,
            calendar_provider: data.calendar_booking?.calendar_provider || null,
            required_fields: data.calendar_booking?.required_fields || [],
            custom_fields: data.calendar_booking?.custom_fields || [],
          }

        })
        .eq("agent_id", agentId)
        .eq("tool_name", "calendar_booking");

      if (toolError) throw toolError;

      // Update agent config and description with tool instructions
      const currentConfig = agent?.config ? 
        (typeof agent.config === 'object' ? agent.config : JSON.parse(agent.config as string)) : {};
      
      const formData = {
        ...data,
        transfer_directory: agent?.transfer_directory ? 
          (typeof agent.transfer_directory === 'object' ? agent.transfer_directory : JSON.parse(agent.transfer_directory as string)) : {},
        description: agent?.description || ""
      };

      // Generate tool instructions and update description
      const toolInstructions = generateToolInstructions(formData);
      const enhancedDescription = appendToolInstructionsToDescription(formData.description, toolInstructions);
      
      const { error: agentError } = await supabase
        .from("agent_configs")
        .update({
          description: enhancedDescription,
          config: {
            ...currentConfig,
            calendar_booking: data.calendar_booking
          } as any
        })
        .eq("id", agentId);

      if (agentError) throw agentError;

      // Sync with VAPI assistant
      try {
        await VapiAssistantUpdateService.syncAgentWithVapi(agentId);
        console.log("Successfully synced agent with VAPI assistant");
      } catch (vapiError) {
        console.error("Failed to sync with VAPI assistant:", vapiError);
        // Don't throw here as the main operation succeeded
      }
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Calendar booking configuration and agent instructions have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["calendar-tool", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
    },
    onError: (error: any) => {
      console.error("Error saving configuration:", error);
      toast({
        title: "Save failed",
        description: error.message || "Failed to save calendar booking configuration.",
        variant: "destructive",
      });
    },
  });

  return {
    agent,
    calendarTool,
    isLoading: agentLoading || toolLoading,
    toggleMutation,
    saveMutation
  };
};
