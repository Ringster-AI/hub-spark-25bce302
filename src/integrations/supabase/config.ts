export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) for this environment.');
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('VITE_SUPABASE_URL must be a Supabase project origin.');
  }
  if (key.startsWith('sb_secret_')) throw new Error('Use a public Supabase key in browser configuration, not a secret key.');
  return { url: parsed.origin, key };
}
