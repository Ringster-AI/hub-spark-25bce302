
import { VapiBaseService } from './base-service';

export class VapiToolsService extends VapiBaseService {
  /**
   * Normalize a phone number to E.164 format.
   * If it already starts with '+', leave it. Otherwise prepend '+1' (North America default).
   */
  private normalizeE164(number: string): string {
    const digits = number.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
  }

  async createTransferTool(transferDirectory: Record<string, any>) {
    console.log('Creating Vapi transfer tool with directory:', transferDirectory);
    
    const destinations = Object.entries(transferDirectory).map(([name, entry]) => ({
      type: "number",
      number: this.normalizeE164(entry.number),
      message: entry.transfer_message || `Transferring your call to ${name}.`
    }));

    const enumValues = destinations.map(d => d.number);

    const toolConfig = {
      type: "transferCall",
      destinations,
      function: {
        name: "transferCall",
        description: "Transfer the call to a specific department or person.",
        parameters: {
          type: "object",
          properties: {
            destination: {
              type: "string",
              enum: enumValues,
              description: "The phone number to transfer the call to."
            },
            reason: {
              type: "string",
              description: "Reason for the transfer"
            }
          },
          required: ["destination"]
        }
      },
      messages: destinations.map(dest => ({
        type: "request-start",
        content: dest.message,
        conditions: [{
          param: "destination",
          operator: "eq",
          value: dest.number
        }]
      }))
    };

    console.log('Transfer tool configuration:', summarizeForLog(toolConfig));

    const data = await this.makeRequest('https://api.vapi.ai/tool', 'POST', toolConfig);
    console.log('Successfully created transfer tool id:', (data as any)?.id ?? '[no id]');
    return data;
  }
}
