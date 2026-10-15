// Environment-specific configuration; never fall back to a production project.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { readSupabaseConfig } from './config';

export const supabaseConfig = readSupabaseConfig(import.meta.env);

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(supabaseConfig.url, supabaseConfig.key);
