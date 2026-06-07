
import { VapiBaseService } from './base-service';
import { summarizeForLog } from '../../utils/redact';

export class VapiAssistantService extends VapiBaseService {
  async createAssistant(config: any) {
    console.log('Creating Vapi assistant with config:', summarizeForLog(config));

    const data = await this.makeRequest(this.apiUrl, 'POST', config);
    console.log('Successfully created Vapi assistant id:', (data as any)?.id ?? '[no id]');
    return data;
  }

  async updateAssistantTools(assistantId: string, toolId: string, model: string, provider: string) {
    console.log(`Updating assistant ${assistantId} with tool ${toolId}`);
    
    const config = {
      model: {
        model,
        provider,
        toolIds: [toolId]
      }
    };

    console.log('Update configuration:', summarizeForLog(config));

    const data = await this.makeRequest(`${this.apiUrl}/${assistantId}`, 'PATCH', config);
    console.log('Successfully updated assistant id:', assistantId);
    return data;
  }

  async getConversationAnalytics(assistantId: string, dateRange?: { startDate: string; endDate: string }) {
    console.log(`Retrieving conversation analytics for assistant: ${assistantId}`);
    
    let url = `https://api.vapi.ai/assistant/${assistantId}/analytics`;
    
    if (dateRange) {
      url += `?start_date=${dateRange.startDate}&end_date=${dateRange.endDate}`;
    }
    
    const data = await this.makeRequest(url, 'GET');
    console.log('Successfully retrieved conversation analytics');
    return data;
  }
}
