
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useSubscriptionFeatures } from "@/hooks/useSubscriptionFeatures";
import { DialogHeader } from "./DialogHeader";
import { AgentForm } from "./AgentForm";
import { SubscriptionGate } from "../subscription/SubscriptionGate";
import { useAgentCount } from "./hooks/useAgentCount";
import { useCreateAgent } from "./hooks/useCreateAgent";
import { useToast } from "@/hooks/use-toast";
import { AgentFormData } from "@/types/agents";

export const CreateAgentDialog = ({ trigger }: { trigger: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const { features } = useSubscriptionFeatures();
  const { toast } = useToast();

  const form = useForm<AgentFormData>({
    defaultValues: {
      voice_id: "9BWtsMINqrJLrRacOk9x", // Default to Aria
      transfer_directory: {},
      advanced_config: {
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "en"
        },
        voice: {
          provider: "11labs",
          voiceId: null,
          customVoiceId: null,
          useCustomVoiceId: false
        }
      }
    },
  });

  const { data: agentCount = 0 } = useAgentCount(open);
  const createAgentMutation = useCreateAgent();

  const onSubmit = async (data: AgentFormData) => {
    if (createAgentMutation.isPending) return;
    
    if (agentCount >= features.limits.maxAgents) {
      toast({
        title: "Agent limit reached",
        description: `You've reached your plan's limit of ${features.limits.maxAgents} agents. Please upgrade your plan to create more agents.`,
        variant: "destructive",
      });
      return;
    }

    try {
      await createAgentMutation.mutateAsync(data);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error("Error creating agent:", error);
      toast({
        title: "Error",
        description: "Failed to create agent. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (createAgentMutation.isPending) return;
      setOpen(newOpen);
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <SubscriptionGate requirement={{ type: "agents", value: agentCount + 1 }}>
          <DialogHeader 
            features={features}
            currentAgentCount={agentCount} 
          />
          <AgentForm 
            form={form} 
            onSubmit={onSubmit} 
            onCancel={() => !createAgentMutation.isPending && setOpen(false)}
            canCustomizeVoice={() => features.limits.canCustomizeVoices}
            disabled={agentCount >= features.limits.maxAgents}
            isSubmitting={createAgentMutation.isPending}
            submitLabel="Create Agent"
            submittingLabel="Creating agent..."
          />
        </SubscriptionGate>
      </DialogContent>
    </Dialog>
  );
};
