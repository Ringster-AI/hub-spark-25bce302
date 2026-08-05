import { useState } from "react";
import { ConversationalWizard, WizardData } from "./wizard/ConversationalWizard";
import { CampaignFlowBuilder, FlowBlock } from "./builder/CampaignFlowBuilder";
import { SmartContactManager } from "./contact/SmartContactManager";
import { LiveCampaignDashboard } from "./dashboard/LiveCampaignDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Sparkles, 
  ArrowLeft, 
  Users, 
  Play, 
  Calendar,
  MessageCircle,
  Target,
  GitBranch,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type BuilderStep = 'wizard' | 'flow' | 'contacts' | 'schedule' | 'dashboard';

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email?: string;
  tags: string[];
  status: 'pending' | 'validated' | 'invalid';
  metadata?: Record<string, any>;
}

interface NextGenCampaignBuilderProps {
  onClose: () => void;
}

export function NextGenCampaignBuilder({ onClose }: NextGenCampaignBuilderProps) {
  const [currentStep, setCurrentStep] = useState<BuilderStep>('wizard');
  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<'scheduled' | 'running' | 'paused' | 'completed'>('scheduled');
  const [scheduleType, setScheduleType] = useState<'now' | 'scheduled'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState<Date | null>(null);
  const [consentAttested, setConsentAttested] = useState(false);
  const [consentSource, setConsentSource] = useState('existing_customer');
  const [consentNotes, setConsentNotes] = useState('');
  const [businessHours, setBusinessHours] = useState({
    start: '09:00',
    end: '17:00',
    timezone: 'America/New_York',
    days: [1, 2, 3, 4, 5] // Monday to Friday
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const steps = {
    wizard: { title: 'Campaign Setup', icon: Sparkles, description: 'Tell us about your campaign' },
    flow: { title: 'Build Conversation', icon: GitBranch, description: 'Design your agent\'s flow' },
    contacts: { title: 'Add Contacts', icon: Users, description: 'Upload your contact list' },
    schedule: { title: 'Schedule & Launch', icon: Calendar, description: 'When to start calling' },
    dashboard: { title: 'Live Dashboard', icon: Target, description: 'Monitor performance' }
  };

  const handleWizardComplete = async (data: WizardData) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to create campaigns.",
          variant: "destructive",
        });
        return;
      }

      // Create agent config first
      const { data: agent, error: agentError } = await supabase
        .from("agent_configs")
        .insert({
          name: `${data.campaignName} Agent`,
          description: data.goalDescription,
          greeting: `Hello! I'm calling from ${data.businessName} about ${data.campaignName}.`,
          goodbye: "Thank you for your time. Have a great day!",
          agent_type: "outbound",
          status: "draft",
          user_id: session.user.id,
        })
        .select()
        .single();

      if (agentError) throw agentError;

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          name: data.campaignName,
          description: data.goalDescription,
          agent_id: agent.id,
          status: "draft",
          user_id: session.user.id,
          config: {
            targetAudience: data.targetAudience,
            goal: data.goal,
            tone: data.tone,
            businessName: data.businessName,
          },
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      setCampaignId(campaign.id);
      setWizardData(data);
      setCurrentStep('flow');
      
      toast({
        title: "Campaign created!",
        description: "Now let's design your agent's conversation flow."
      });
    } catch (error: any) {
      toast({
        title: "Error creating campaign",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateAgentWithFlow = useMutation({
    mutationFn: async ({ agentId, systemPrompt }: { agentId: string; systemPrompt: string }) => {
      // Update agent description with the generated system prompt
      const { error } = await supabase
        .from("agent_configs")
        .update({ 
          description: systemPrompt,
          status: 'active' 
        })
        .eq('id', agentId);

      if (error) throw error;

      // Sync with VAPI assistant to update the system prompt
      const { data: vapiResult, error: vapiError } = await supabase.functions.invoke('manage-vapi-assistant', {
        body: {
          agentId: agentId,
          action: 'update'
        }
      });

      if (vapiError) {
        console.error('VAPI sync error:', vapiError);
        throw new Error(`Failed to sync with VAPI: ${vapiError.message}`);
      }

      if (!vapiResult?.success) {
        throw new Error(`Failed to sync with VAPI: ${vapiResult?.error || 'Unknown error'}`);
      }

      return vapiResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent_configs"] });
      toast({
        title: "Flow saved and synced!",
        description: "Your agent's conversation flow has been configured and synced with VAPI."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error syncing flow",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const convertFlowToSystemPrompt = (blocks: FlowBlock[]): string => {
    let prompt = `You are an AI sales agent conducting outbound calls for ${wizardData?.businessName}. Follow this conversation flow:

`;

    blocks.forEach((block, index) => {
      prompt += `${index + 1}. ${block.title.toUpperCase()}:\n`;
      prompt += `   ${block.content}\n`;
      
      if (block.tone) {
        prompt += `   (Use a ${block.tone} tone)\n`;
      }
      
      if (block.conditions && block.conditions.length > 0) {
        prompt += `   Handle responses:\n`;
        block.conditions.forEach(condition => {
          prompt += `   - If they say "${condition.response}" or similar: ${condition.label}\n`;
        });
      }
      
      prompt += `\n`;
    });

    prompt += `IMPORTANT GUIDELINES:
- Stay on script but sound natural and conversational
- Listen for buying signals and adapt accordingly
- If asked to be removed from list, politely comply and end call
- Keep responses concise (under 30 seconds)
- Always be respectful of their time
- If scheduling, confirm date, time, and contact details
- Your goal is: ${wizardData?.goalDescription}
- Target audience: ${wizardData?.targetAudience}`;

    return prompt;
  };

  const handleFlowSave = async (blocks: FlowBlock[]) => {
    console.log('Saving flow blocks:', blocks);
    setFlowBlocks(blocks);
    
    if (!campaignId) {
      toast({
        title: "Error",
        description: "No campaign ID found. Please restart the campaign creation process.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the associated agent ID from the campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("agent_id, config")
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        throw new Error("Failed to fetch campaign data");
      }

      // Convert flow blocks to system prompt
      const systemPrompt = convertFlowToSystemPrompt(blocks);
      
      // Save flow blocks to campaign config for persistence
      const existingConfig = campaign.config as Record<string, any> || {};
      const updatedConfig = {
        ...existingConfig,
        flowBlocks: blocks.map(block => ({
          id: block.id,
          type: block.type,
          title: block.title,
          content: block.content,
          tone: block.tone,
          conditions: block.conditions
        })),
        systemPrompt
      };

      const { error: configUpdateError } = await supabase
        .from("campaigns")
        .update({ config: updatedConfig })
        .eq('id', campaignId);

      if (configUpdateError) throw configUpdateError;
      
      // Update the agent and sync with VAPI
      await updateAgentWithFlow.mutateAsync({ 
        agentId: campaign.agent_id, 
        systemPrompt 
      });

      setCurrentStep('contacts');
    } catch (error: any) {
      toast({
        title: "Error saving flow",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFlowPreview = (blocks: FlowBlock[]) => {
    // Mock preview functionality
    toast({
      title: "Preview ready!",
      description: "Here's how your agent will sound..."
    });
  };

  const handleContactsReady = (contactList: Contact[]) => {
    setContacts(contactList);
    setCurrentStep('schedule');
    toast({
      title: "Contacts added!",
      description: `${contactList.length} contacts ready to call.`
    });
  };

  const handleLaunchCampaign = async () => {
    if (!campaignId) return;
    
    try {
      // Save contacts to database first
      if (contacts.length > 0) {
        const { error: contactsError } = await supabase
          .from("campaign_contacts")
          .insert(
            contacts.map(contact => ({
              campaign_id: campaignId,
              first_name: contact.firstName,
              last_name: contact.lastName,
              phone_number: contact.phoneNumber,
              metadata: contact.metadata || {},
              status: 'pending'
            }))
          );

        if (contactsError) throw contactsError;
      }

      // Update campaign with schedule information
      const updateData: any = {
        status: scheduleType === 'now' ? 'running' : 'scheduled',
        config: {
          ...wizardData,
          businessHours,
          retrySettings: {
            maxAttempts: 3,
            retryDelayMinutes: [60, 180, 360], // 1hr, 3hr, 6hr delays
            respectBusinessHours: true
          }
        }
      };

      if (scheduleType === 'scheduled' && scheduledDateTime) {
        updateData.scheduled_start = scheduledDateTime.toISOString();
      }

      const { error } = await supabase
        .from("campaigns")
        .update(updateData)
        .eq('id', campaignId);

      if (error) throw error;

      setCampaignStatus(scheduleType === 'now' ? 'running' : 'scheduled');
      setCurrentStep('dashboard');
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      
      const message = scheduleType === 'now' 
        ? `Your agent is now calling ${contacts.length} contacts.`
        : `Campaign scheduled for ${scheduledDateTime?.toLocaleString()}.`;
      
      toast({
        title: "Campaign launched! 🚀",
        description: message
      });
    } catch (error: any) {
      toast({
        title: "Error launching campaign",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = (status: string) => {
    setCampaignStatus(status as any);
    toast({
      title: "Campaign status updated",
      description: `Campaign is now ${status}.`
    });
  };

  const handleBackToStep = (step: BuilderStep) => {
    setCurrentStep(step);
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
      {Object.entries(steps).map(([step, config], index) => {
        const isActive = currentStep === step;
        const isCompleted = Object.keys(steps).indexOf(currentStep) > index;
        const StepIcon = config.icon;

        return (
          <div key={step} className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}
              size="sm"
              className={`flex items-center gap-2 transition-all ${
                isCompleted ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''
              }`}
              onClick={() => isCompleted || isActive ? handleBackToStep(step as BuilderStep) : undefined}
              disabled={!isCompleted && !isActive}
            >
              <StepIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{config.title}</span>
              <span className="sm:hidden">{index + 1}</span>
            </Button>
            {index < Object.keys(steps).length - 1 && (
              <div className="w-4 h-px bg-border flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'wizard':
        return (
          <ConversationalWizard
            onComplete={handleWizardComplete}
            onClose={onClose}
          />
        );

      case 'flow':
        if (!wizardData) return null;
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Design Your Agent's Conversation</h2>
                <p className="text-muted-foreground">
                  Build the perfect flow for {wizardData.campaignName}
                </p>
              </div>
              <Button variant="outline" onClick={() => setCurrentStep('wizard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
            </div>
            <CampaignFlowBuilder
              wizardData={wizardData}
              onSave={handleFlowSave}
              onPreview={handleFlowPreview}
            />
          </div>
        );

      case 'contacts':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Add Your Contacts</h2>
                <p className="text-muted-foreground">
                  Upload, paste, or manually add the people you want to call
                </p>
              </div>
              <Button variant="outline" onClick={() => setCurrentStep('flow')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Flow
              </Button>
            </div>
            <SmartContactManager onContactsReady={handleContactsReady} />
          </div>
        );

      case 'schedule':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Schedule & Launch</h2>
                <p className="text-muted-foreground">
                  When should your agent start calling?
                </p>
              </div>
              <Button variant="outline" onClick={() => setCurrentStep('contacts')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Contacts
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Campaign Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Campaign Name</span>
                      <span className="font-medium">{wizardData?.campaignName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Target Audience</span>
                      <Badge variant="outline" className="capitalize">
                        {wizardData?.targetAudience.replace('-', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Goal</span>
                      <Badge variant="outline" className="capitalize">
                        {wizardData?.goal.replace('-', ' ')}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Contacts</span>
                      <span className="font-medium">{contacts.length} people</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Flow Blocks</span>
                      <span className="font-medium">{flowBlocks.length} blocks</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Launch Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="launch" 
                        value="now" 
                        checked={scheduleType === 'now'}
                        onChange={() => setScheduleType('now')}
                        className="text-primary" 
                      />
                      <div>
                        <div className="font-medium">Start Now</div>
                        <div className="text-sm text-muted-foreground">Begin calling immediately</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input 
                        type="radio" 
                        name="launch" 
                        value="scheduled" 
                        checked={scheduleType === 'scheduled'}
                        onChange={() => setScheduleType('scheduled')}
                        className="text-primary" 
                      />
                      <div>
                        <div className="font-medium">Schedule for Later</div>
                        <div className="text-sm text-muted-foreground">Pick a specific date and time</div>
                      </div>
                    </label>
                  </div>

                  {scheduleType === 'scheduled' && (
                    <div className="space-y-3 p-3 border rounded-lg bg-accent/20">
                      <div>
                        <label className="text-sm font-medium">Start Date & Time</label>
                        <Input
                          type="datetime-local"
                          value={scheduledDateTime ? scheduledDateTime.toISOString().slice(0, 16) : ''}
                          onChange={(e) => setScheduledDateTime(e.target.value ? new Date(e.target.value) : null)}
                          min={new Date().toISOString().slice(0, 16)}
                          className="mt-1"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium">Business Hours Start</label>
                          <Input
                            type="time"
                            value={businessHours.start}
                            onChange={(e) => setBusinessHours(prev => ({ ...prev, start: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Business Hours End</label>
                          <Input
                            type="time"
                            value={businessHours.end}
                            onChange={(e) => setBusinessHours(prev => ({ ...prev, end: e.target.value }))}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium">Timezone</label>
                        <select 
                          value={businessHours.timezone}
                          onChange={(e) => setBusinessHours(prev => ({ ...prev, timezone: e.target.value }))}
                          className="mt-1 w-full p-2 border rounded text-sm"
                        >
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">Pacific Time</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <h4 className="font-medium">Consent attestation (required)</h4>
                    </div>

                    <div>
                      <label className="text-sm font-medium">How did you obtain consent?</label>
                      <select
                        value={consentSource}
                        onChange={(e) => setConsentSource(e.target.value)}
                        className="mt-1 w-full p-2 border rounded text-sm bg-background"
                      >
                        <option value="existing_customer">Existing customer / prior business relationship</option>
                        <option value="web_form">Web form opt-in with disclosure</option>
                        <option value="written_consent">Signed written consent</option>
                        <option value="inbound_request">Caller requested a callback</option>
                        <option value="other">Other (describe below)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Notes (optional)</label>
                      <Input
                        value={consentNotes}
                        onChange={(e) => setConsentNotes(e.target.value)}
                        placeholder="e.g. Opt-ins collected via booking form since Jan 2026"
                        className="mt-1"
                      />
                    </div>

                    <label className="flex items-start gap-2 rounded-lg border p-3 bg-accent/20 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentAttested}
                        onChange={(e) => setConsentAttested(e.target.checked)}
                        className="mt-1"
                      />
                      <span className="text-sm text-muted-foreground">
                        I confirm I have prior express consent to call every contact on this list, that I have
                        scrubbed it against the National and internal Do Not Call lists, and that I am solely
                        responsible for compliance with the TCPA and applicable state calling laws. Calls are
                        recorded and disclosed, and will only be placed between 8:00am and 9:00pm in each
                        contact's local time.
                      </span>
                    </label>

                    <p className="text-xs text-muted-foreground">
                      Ringster enforces the 8am–9pm local calling window and your Do Not Call suppression list
                      automatically. Campaigns without an attestation on file will not dial.
                    </p>
                  </div>

                  <Button 
                    onClick={handleLaunchCampaign} 
                    className="w-full bg-gradient-to-r from-primary to-primary-glow"
                    disabled={!consentAttested || (scheduleType === 'scheduled' && !scheduledDateTime)}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {scheduleType === 'now' ? 'Launch Campaign' : 'Schedule Campaign'}
                  </Button>

                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'dashboard':
        if (!campaignId || !wizardData) return null;
        return (
          <LiveCampaignDashboard
            campaignId={campaignId}
            campaignName={wizardData.campaignName}
            status={campaignStatus}
            onStatusChange={handleStatusChange}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5">
      <div className="container mx-auto p-6">
        {currentStep !== 'wizard' && currentStep !== 'dashboard' && renderStepIndicator()}
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="min-h-[600px]"
          >
            {renderCurrentStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}