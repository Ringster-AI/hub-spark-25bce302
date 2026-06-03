
import { useState } from "react";
import { useSubscriptionFeatures } from "@/hooks/useSubscriptionFeatures";
import { useToast } from "@/hooks/use-toast";
import { AgentConfig } from "@/types/database/agents";
import Vapi from "@vapi-ai/web";

let activeVapi: Vapi | null = null;
import { EditAgentDialog } from "./EditAgentDialog";
import { AgentTrialWarning } from "./AgentTrialWarning";
import { AgentHeader } from "./AgentHeader";
import { AgentPhoneInfo } from "./AgentPhoneInfo";
import { AgentUsageStats } from "./AgentUsageStats";
import { getVapiPublicKey } from "@/utils/env";

interface AgentCardProps {
  agent: AgentConfig;
  onToggleStatus: (id: string, currentStatus: string) => Promise<void>;
  onUpdate: () => void;
}

export const AgentCard = ({ agent, onToggleStatus, onUpdate }: AgentCardProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { features } = useSubscriptionFeatures();
  const { toast } = useToast();

  const showTrialWarning = features.isTrialing && features.expiresAt && 
    new Date(features.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const handleBrowserCall = async () => {
    try {
      console.log('Starting browser call...');
      
      const VAPI_PUBLIC_KEY = getVapiPublicKey();
      
      console.log('VAPI_PUBLIC_KEY retrieved:', VAPI_PUBLIC_KEY ? 'Present' : 'Missing');
      
      if (!VAPI_PUBLIC_KEY) {
        console.error('VAPI public key not found in environment variables');
        
        // Check what environment variables are actually available
        console.log('Available environment variables:', {
          importMetaEnv: typeof import.meta !== 'undefined' ? Object.keys(import.meta.env || {}) : 'Not available',
          windowEnv: typeof window !== 'undefined' && window.ENV ? Object.keys(window.ENV) : 'Not available'
        });
        
        toast({
          title: "VAPI Configuration Missing",
          description: "To use the Call Agent feature, you need to set up your VAPI public key. Create a .env file in your project root and add: VITE_VAPI_PUBLIC_KEY=your_key_here, then restart the development server.",
          variant: "destructive",
        });
        return;
      }

      const fallbackAssistantId = agent.config && typeof agent.config === 'object' && !Array.isArray(agent.config)
        ? (agent.config as Record<string, unknown>).vapi_assistant_id
        : null;

      const assistantId = agent.vapi_assistant_id || (typeof fallbackAssistantId === 'string' ? fallbackAssistantId : null);
      if (!assistantId) {
        throw new Error("This agent doesn't have a valid assistant ID configured.");
      }

      console.log('Starting browser call with assistant ID:', assistantId);
      if (activeVapi) {
        try { await activeVapi.stop(); } catch (e) { console.warn('Failed to stop previous Vapi instance', e); }
        activeVapi = null;
      }
      const vapi = new Vapi(VAPI_PUBLIC_KEY);
      activeVapi = vapi;
      vapi.on('call-end', () => { if (activeVapi === vapi) activeVapi = null; });
      vapi.on('error', () => { if (activeVapi === vapi) activeVapi = null; });
      await vapi.start(assistantId);
      
      toast({
        title: "Call Started",
        description: "You can now speak with your AI agent through your browser.",
      });
    } catch (error) {
      console.error('Vapi call error:', error);
      toast({
        title: "Error Starting Call",
        description: error instanceof Error ? error.message : "Failed to start call. Please check your Vapi configuration.",
        variant: "destructive",
      });
    }
  };

  const handleEditComplete = () => {
    setIsEditOpen(false);
    onUpdate();
  };

  return (
    <div className="border rounded-lg p-6 space-y-4 hover:shadow-md transition-shadow">
      {showTrialWarning && <AgentTrialWarning />}
      
      <AgentHeader
        name={agent.name}
        id={agent.id}
        status={agent.status}
        onEdit={() => setIsEditOpen(true)}
        onToggleStatus={onToggleStatus}
      />

      <p className="text-sm text-muted-foreground line-clamp-2">
        {agent.description || "No description provided"}
      </p>

      <AgentPhoneInfo
        phoneNumber={agent.phone_number}
        isActive={agent.status === 'active'}
        onBrowserCall={handleBrowserCall}
      />

      <AgentUsageStats
        minutesUsed={agent.minutes_used}
        totalMinutesUsed={agent.total_minutes_used}
      />

      <EditAgentDialog 
        agent={agent} 
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            onUpdate();
          }
        }}
      />
    </div>
  );
};
