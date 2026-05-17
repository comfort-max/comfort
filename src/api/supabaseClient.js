import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // OAuth is finalized on /auth/callback to avoid double PKCE exchange races.
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
  },
});