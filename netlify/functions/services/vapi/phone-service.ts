
import { VapiBaseService } from './base-service';
import { summarizeForLog } from '../../utils/redact';

export class VapiPhoneService extends VapiBaseService {
  async importTwilioNumber(assistantId: string, twilioNumber: string, twilioAccountSid: string, twilioAuthToken: string) {
    console.log('Importing Twilio number into Vapi for assistant:', assistantId);

    
    const importUrl = 'https://api.vapi.ai/phone-number';
    console.log('Using import URL:', importUrl);
    
    const config = {
      provider: "twilio",
      number: twilioNumber,
      name: `Twilio Number ${twilioNumber}`,
      assistantId: assistantId,
      twilioAccountSid: twilioAccountSid,
      twilioAuthToken: twilioAuthToken,
      server: {
        timeoutSeconds: 20,
        url: "https://api.vapi.ai/webhook"
      }
    };

    console.log('Import configuration:', summarizeForLog(config));

    const data = await this.makeRequest(importUrl, 'POST', config);
    console.log('Successfully imported Twilio number id:', (data as any)?.id ?? '[no id]');
    return data;
  }
}
