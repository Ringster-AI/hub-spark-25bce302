import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from '../../src/integrations/supabase/config';

describe('environment isolation', () => {
  it('uses the chosen project and publishable key', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://pjjdugmymtqoxyompiof.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key' }))
      .toEqual({ url: 'https://pjjdugmymtqoxyompiof.supabase.co', key: 'public-test-key' });
  });
  it('supports the existing anon-key setting', () => {
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'legacy-test-key' }).key).toBe('legacy-test-key');
  });
  it.each([{}, { VITE_SUPABASE_URL: 'https://example.supabase.co' }, { VITE_SUPABASE_ANON_KEY: 'key' }])('never falls back to production with incomplete configuration', env => {
    expect(() => readSupabaseConfig(env)).toThrow('Set VITE_SUPABASE_URL');
  });
  it('rejects a server secret in the public setting', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' })).toThrow('public Supabase key');
  });
});
