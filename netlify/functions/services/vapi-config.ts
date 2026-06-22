import { AgentConfig } from '../../../src/types/database/agents';

export interface VapiAssistantConfig {
  name: string;
  firstMessage: string;
  model: {
    provider: string;
    model: string;
    temperature: number;
    toolIds?: string[];
    messages: Array<{
      role: string;
      content: string;
    }>;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  transcriber: {
    provider: string;
    model: string;
    language: string;
  };
  endCallMessage: string;
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
  server?: {
    url: string;
    secret?: string;
  };
  serverMessages?: string[];
  metadata?: Record<string, unknown>;
}

export const VAPI_SERVER_MESSAGES = [
  "status-update",
  "transcript",
  "end-of-call-report",
] as const;

/**
 * Build supplemental system prompt context from agent config.
 * This includes transfer directory mappings and calendar booking instructions.
 * These are static per-agent config that only change on re-save (which triggers a sync).
 */
function buildToolContext(agent: AgentConfig): string {
  const sections: string[] = [];

  // Transfer directory context
  const transferDir = agent.transfer_directory as Record<string, any> | null;
  if (transferDir && typeof transferDir === 'object' && Object.keys(transferDir).length > 0) {
    const entries = Object.entries(transferDir)
      .map(([name, info]: [string, any]) => {
        const number = info?.number || 'unknown';
        const hours = info?.transfer_hours
          ? ` (available ${info.transfer_hours.start}–${info.transfer_hours.end})`
          : '';
        return `  - ${name}: ${number}${hours}`;
      })
      .join('\n');

    sections.push(
      `\n\n## Call Transfers\nYou can transfer calls to the following people/departments. Use the transferCall tool with the phone number as the destination.\n${entries}\nWhen a caller asks to speak with someone on this list, transfer them immediately using the transferCall tool.`
    );
  }

  // Calendar booking context
  const config = agent.config as Record<string, any> | null;
  const calendarBooking = config?.calendar_booking as Record<string, any> | null;
  if (calendarBooking?.enabled) {
    const businessStart = calendarBooking.business_hours_start || '09:00';
    const businessEnd = calendarBooking.business_hours_end || '17:00';
    const duration = calendarBooking.default_duration || 30;
    const leadTime = calendarBooking.booking_lead_time_hours || 2;

    let calendarInstructions = `\n\n## Calendar & Appointment Booking\nYou can check availability and book appointments. Always use get_current_datetime first to know today's date before checking availability.\nBusiness hours: ${businessStart} to ${businessEnd}.\nDefault appointment duration: ${duration} minutes.\nMinimum booking lead time: ${leadTime} hours from now.\nUse check_availability with a date in YYYY-MM-DD format, then offer the caller available slots. Once they choose a slot, use book_appointment to confirm.`;

    // Required fields instructions
    const requiredFields = calendarBooking.required_fields as string[] || [];
    const customFields = calendarBooking.custom_fields as Array<{ name: string; description: string }> || [];

    const fieldLabels: string[] = [];
    if (requiredFields.includes('phone')) fieldLabels.push('phone number');
    if (requiredFields.includes('address')) fieldLabels.push('service address');
    for (const rf of requiredFields) {
      if (rf.startsWith('custom:')) {
        const fieldName = rf.replace('custom:', '');
        const customDef = customFields.find(f => f.name === fieldName);
        fieldLabels.push(customDef?.description || fieldName);
      }
    }

    if (fieldLabels.length > 0) {
      calendarInstructions += `\n\nIMPORTANT: Before booking, you MUST collect the following from the caller: ${fieldLabels.join(', ')}. Do not proceed with booking until all required fields are provided.`;
      if (requiredFields.includes('phone')) {
        calendarInstructions += `\n\nPhone number handling: Accept the phone number in whatever format the caller speaks it. Do NOT ask them to repeat it in a specific format (no E.164, no "with country code", no dashes required). Pass the digits as a plain string to book_appointment — the system handles formatting. Never tell the caller you are having trouble saving their phone number.`;
      }
    }

    sections.push(calendarInstructions);
  }

  // Date awareness — silent usage instruction
  sections.push(
    `\n\n## Date Awareness\nIf you need to know the current date, day of the week, or time, silently use the get_current_datetime tool in the background. Never announce to the caller that you are looking up the date or time — just use the information naturally in conversation. Never guess or assume the date.`
  );

  return sections.join('');
}

export const createVapiAssistantConfig = (
  agent: AgentConfig
): VapiAssistantConfig => {
  const advancedConfig = agent.advanced_config as any || {};
  const voiceConfig = advancedConfig.voice || {};
  const transcriberConfig = advancedConfig.transcriber || {};

  const baseDescription = agent.description || "You are a helpful AI assistant.";
  const toolContext = buildToolContext(agent);
  const fullSystemPrompt = baseDescription + toolContext;

  // Server webhook for end-of-call deduction (Supabase edge function)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const vapiServerSecret = process.env.VAPI_SERVER_SECRET;
  const server = supabaseUrl
    ? {
        url: `${supabaseUrl}/functions/v1/vapi-webhook`,
        ...(vapiServerSecret ? { secret: vapiServerSecret } : {}),
      }
    : undefined;

  return {
    name: agent.name,
    firstMessage: agent.greeting || "Hello! How can I help you today?",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: fullSystemPrompt
        }
      ]
    },
    voice: {
      provider: voiceConfig.provider || "11labs",
      voiceId: voiceConfig.useCustomVoiceId ? voiceConfig.customVoiceId : (agent.config?.voice_id || "21m00Tcm4TlvDq8ikWAM"),
    },
    transcriber: {
      provider: transcriberConfig.provider || "deepgram",
      model: transcriberConfig.model || "nova-2",
      language: transcriberConfig.language || "en"
    },
    endCallMessage: agent.goodbye || "Thank you for calling. Goodbye!",
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 600,
    ...(server ? { server, serverMessages: [...VAPI_SERVER_MESSAGES] } : {}),
    metadata: {
      agent_id: agent.id,
      user_id: agent.user_id,
    },
  };
};
