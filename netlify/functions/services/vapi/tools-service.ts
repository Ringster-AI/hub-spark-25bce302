
import { VapiBaseService } from './base-service';
import { summarizeForLog } from '../../utils/redact';


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

  /**
   * Create a Vapi `transferCall` tool.
   *
   * IMPORTANT: Vapi's transferCall tool type does NOT accept an arbitrary
   * `function.parameters` schema (a custom `destination` enum or `reason` param).
   * If you send one, Vapi will create the tool but silently strip its ID from
   * `model.toolIds` when you try to attach it to an assistant.
   *
   * The correct shape is just `{ type, destinations }` — the LLM picks the
   * destination from each entry's `description` (and the assistant's system
   * prompt context built in `vapi-config.ts`).
   */
  async createTransferTool(
    transferDirectory: Record<string, any>,
    metadata?: Record<string, unknown>
  ) {
    console.log('Creating Vapi transfer tool with directory:', transferDirectory);

    const destinations = Object.entries(transferDirectory).map(([name, entry]) => {
      const keywords = Array.isArray(entry?.keywords) ? entry.keywords.filter(Boolean) : [];
      const descriptionParts = [`Transfer to ${name}`];
      if (keywords.length > 0) {
        descriptionParts.push(`Keywords: ${keywords.join(', ')}`);
      }
      return {
        type: 'number' as const,
        number: this.normalizeE164(entry.number),
        message: entry.transfer_message || `Transferring your call to ${name}.`,
        description: descriptionParts.join('. '),
      };
    });

    const toolConfig: Record<string, unknown> = {
      type: 'transferCall',
      destinations,
    };

    // NOTE: Vapi rejects a top-level `metadata` property on tool create
    // ("property metadata should not exist"). Do not attach it here.


    console.log('Transfer tool configuration:', summarizeForLog(toolConfig));

    const data = await this.makeRequest('https://api.vapi.ai/tool', 'POST', toolConfig);
    console.log('Successfully created transfer tool id:', (data as any)?.id ?? '[no id]');
    return data;
  }
}
