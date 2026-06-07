
import { supabase } from "@/integrations/supabase/client";
import { Integration, IntegrationLog, CampaignIntegration } from "@/types/integrations/index";

// Select all columns EXCEPT credentials - credentials should never be read client-side
const SAFE_COLUMNS = 'id, user_id, integration_type, provider_name, display_name, status, configuration, metadata, capabilities, is_active, last_sync_at, expires_at, created_at, updated_at';

export class IntegrationService {
  static async getUserIntegrations(): Promise<Integration[]> {
    const [{ data, error }, googleRes] = await Promise.all([
      supabase
        .from('integrations')
        .select(SAFE_COLUMNS)
        .order('created_at', { ascending: false }),
      supabase
        .from('google_integrations')
        .select('id, user_id, email, created_at, updated_at, scopes, expires_at'),
    ]);

    if (error) throw error;

    const base: Integration[] = data.map(item => ({
      ...item,
      credentials: {},
      status: item.status as Integration['status'],
      configuration: item.configuration as Record<string, any>,
      metadata: item.metadata as Record<string, any>
    }));

    // Merge in google_integrations rows as synthetic 'google_calendar' integrations
    // so the UI reflects the connection that was made via the dedicated google OAuth flow.
    if (!googleRes.error && googleRes.data) {
      for (const g of googleRes.data) {
        if (base.some(b => b.integration_type === 'google_calendar')) continue;
        base.unshift({
          id: g.id,
          user_id: g.user_id,
          integration_type: 'google_calendar',
          provider_name: 'google',
          display_name: g.email || 'Google Calendar',
          status: 'connected',
          configuration: {},
          metadata: { email: g.email, scopes: g.scopes },
          capabilities: ['calendar', 'scheduling', 'events'],
          is_active: true,
          last_sync_at: null as any,
          expires_at: g.expires_at,
          created_at: g.created_at,
          updated_at: g.updated_at,
          credentials: {},
        } as Integration);
      }
    }

    return base;
  }

  static async getIntegrationById(id: string): Promise<Integration | null> {
    const { data, error } = await supabase
      .from('integrations')
      .select(SAFE_COLUMNS)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return {
      ...data,
      credentials: {},
      status: data.status as Integration['status'],
      configuration: data.configuration as Record<string, any>,
      metadata: data.metadata as Record<string, any>
    };
  }

  static async getIntegrationByType(type: string): Promise<Integration | null> {
    const { data, error } = await supabase
      .from('integrations')
      .select(SAFE_COLUMNS)
      .eq('integration_type', type)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return {
      ...data,
      credentials: {},
      status: data.status as Integration['status'],
      configuration: data.configuration as Record<string, any>,
      metadata: data.metadata as Record<string, any>
    };
  }

  static async createIntegration(integration: Omit<Integration, 'id' | 'created_at' | 'updated_at'>): Promise<Integration> {
    // Strip credentials from client-side inserts - credentials should be set server-side only
    const { credentials: _creds, ...safeData } = integration;
    const { data, error } = await supabase
      .from('integrations')
      .insert({
        ...safeData,
        credentials: {},
        configuration: integration.configuration as any,
        metadata: integration.metadata as any
      })
      .select(SAFE_COLUMNS)
      .single();

    if (error) throw error;
    return {
      ...data,
      credentials: {},
      status: data.status as Integration['status'],
      configuration: data.configuration as Record<string, any>,
      metadata: data.metadata as Record<string, any>
    };
  }

  static async updateIntegration(id: string, updates: Partial<Integration>): Promise<Integration> {
    // Strip credentials from client-side updates
    const { credentials: _creds, ...safeUpdates } = updates;
    const updateData: any = { ...safeUpdates };
    if (updateData.configuration) {
      updateData.configuration = updateData.configuration as any;
    }
    if (updateData.metadata) {
      updateData.metadata = updateData.metadata as any;
    }

    const { data, error } = await supabase
      .from('integrations')
      .update(updateData)
      .eq('id', id)
      .select(SAFE_COLUMNS)
      .single();

    if (error) throw error;
    return {
      ...data,
      credentials: {},
      status: data.status as Integration['status'],
      configuration: data.configuration as Record<string, any>,
      metadata: data.metadata as Record<string, any>
    };
  }

  static async deleteIntegration(id: string): Promise<void> {
    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async getCampaignIntegrations(campaignId: string): Promise<CampaignIntegration[]> {
    const { data, error } = await supabase
      .from('campaign_integrations')
      .select(`
        *,
        integration:integrations(${SAFE_COLUMNS})
      `)
      .eq('campaign_id', campaignId);

    if (error) throw error;
    return data.map(item => ({
      ...item,
      configuration: item.configuration as Record<string, any>,
      integration: item.integration ? {
        ...item.integration,
        credentials: {},
        status: item.integration.status as Integration['status'],
        configuration: item.integration.configuration as Record<string, any>,
        metadata: item.integration.metadata as Record<string, any>
      } : undefined
    }));
  }

  static async addCampaignIntegration(
    campaignId: string,
    integrationId: string,
    configuration: Record<string, any> = {}
  ): Promise<CampaignIntegration> {
    const { data, error } = await supabase
      .from('campaign_integrations')
      .insert({
        campaign_id: campaignId,
        integration_id: integrationId,
        configuration: configuration as any
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      configuration: data.configuration as Record<string, any>
    };
  }

  static async updateCampaignIntegration(
    id: string,
    updates: Partial<CampaignIntegration>
  ): Promise<CampaignIntegration> {
    const updateData: any = { ...updates };
    if (updateData.configuration) {
      updateData.configuration = updateData.configuration as any;
    }

    const { data, error } = await supabase
      .from('campaign_integrations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      configuration: data.configuration as Record<string, any>
    };
  }

  static async removeCampaignIntegration(id: string): Promise<void> {
    const { error } = await supabase
      .from('campaign_integrations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async logIntegrationActivity(
    integrationId: string,
    action: string,
    status: 'success' | 'failure' | 'pending',
    message?: string,
    details?: Record<string, any>
  ): Promise<IntegrationLog> {
    const { data, error } = await supabase
      .from('integration_logs')
      .insert({
        integration_id: integrationId,
        action,
        status,
        message,
        details: (details || {}) as any
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      status: data.status as IntegrationLog['status'],
      details: data.details as Record<string, any>
    };
  }

  static async getIntegrationLogs(
    integrationId: string,
    beforeCursor?: string,
    pageSize: number = 25
  ): Promise<IntegrationLog[]> {
    let query = supabase
      .from('integration_logs')
      .select('*')
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (beforeCursor) {
      query = query.lt('created_at', beforeCursor);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data.map(item => ({
      ...item,
      status: item.status as IntegrationLog['status'],
      details: item.details as Record<string, any>
    }));
  }
}
