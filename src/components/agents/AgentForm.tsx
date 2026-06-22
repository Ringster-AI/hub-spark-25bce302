
import React, { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { BasicAgentInfo } from "./BasicAgentInfo";
import { AgentMessages } from "./AgentMessages";
import { VoiceSelection } from "./VoiceSelection";
import { TransferDirectory } from "./TransferDirectory";
import { FormActions } from "./FormActions";
import { AdvancedAgentConfig } from "./AdvancedAgentConfig";
import { CalendarBookingConfig } from "./CalendarBookingConfig";
import { AgentFormData } from "@/types/agents";
import { useSubscriptionFeatures } from "@/hooks/useSubscriptionFeatures";

interface AgentFormProps {
  form: UseFormReturn<AgentFormData>;
  onSubmit: (data: AgentFormData) => Promise<void>;
  onCancel: () => void;
  canCustomizeVoice: () => boolean;
  disabled?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}

export const AgentForm = ({ form, onSubmit, onCancel, canCustomizeVoice, disabled, isSubmitting, submitLabel, submittingLabel }: AgentFormProps) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { features } = useSubscriptionFeatures();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h3 className="text-lg font-medium mb-4">Agent Type</h3>
            <RadioGroup
              defaultValue="inbound"
              value={form.watch("agent_type") || "inbound"}
              onValueChange={(value) => form.setValue("agent_type", value as "inbound" | "outbound")}
              className="grid grid-cols-2 gap-4"
              disabled={disabled}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inbound" id="inbound" />
                <Label htmlFor="inbound">Inbound Agent</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="outbound" id="outbound" />
                <Label htmlFor="outbound">Outbound Agent</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <BasicAgentInfo form={form} disabled={disabled} />
        <AgentMessages form={form} disabled={disabled} />
        
        {features.isPaid ? (
          <CalendarBookingConfig form={form} disabled={disabled} />
        ) : (
          <div className="rounded-lg border p-4 bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium">Calendar Booking</h3>
                <p className="text-sm text-muted-foreground">
                  Let your agent book appointments during calls. Available on paid plans.
                </p>
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-md bg-primary/10 text-primary whitespace-nowrap">
                Upgrade required
              </span>
            </div>
          </div>
        )}
        
        {features.isPaid && (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="text-lg font-medium">Advanced Mode</h3>
              <p className="text-sm text-muted-foreground">
                Configure advanced settings for transcription and voice
              </p>
            </div>
            <Switch
              checked={showAdvanced}
              onCheckedChange={setShowAdvanced}
              disabled={disabled}
            />
          </div>
        )}

        {showAdvanced && features.isPaid ? (
          <AdvancedAgentConfig form={form} disabled={disabled} />
        ) : (
          <VoiceSelection 
            value={form.watch("voice_id")} 
            onChange={(value) => form.setValue("voice_id", value)}
            disabled={!canCustomizeVoice() || disabled}
            disabledMessage={disabled ? "You've reached your agent limit" : "Upgrade your plan to customize agent voices"}
          />
        )}
        
        <TransferDirectory 
          value={form.watch("transfer_directory")} 
          onChange={(value) => form.setValue("transfer_directory", value)}
          disabled={disabled}
        />
        <FormActions onCancel={onCancel} disabled={disabled} isSubmitting={isSubmitting} submitLabel={submitLabel} submittingLabel={submittingLabel} />
      </form>
    </Form>
  );
};
