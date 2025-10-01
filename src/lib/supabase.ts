import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://api.fordago.site';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Add detailed error checking
if (!supabaseUrl) {
  console.error('VITE_SUPABASE_URL is missing. Current value:', supabaseUrl);
  throw new Error('Missing VITE_SUPABASE_URL in environment variables. Check your .env file.');
}

if (!supabaseAnonKey) {
  console.error('VITE_SUPABASE_ANON_KEY is missing. Current value:', supabaseAnonKey);
  throw new Error('Missing VITE_SUPABASE_ANON_KEY in environment variables. Check your .env file.');
}

// Create the Supabase client with additional options
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'fordago.auth.token',
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Profile': 'public',
      'apikey': supabaseAnonKey
    },
  },
});

// Add custom session change listener for important events only
supabase.auth.onAuthStateChange((event, session) => {
  if (import.meta.env.DEV) {
    // Only log important auth events
    if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'USER_DELETED'].includes(event)) {
      console.log('Auth Event:', event);
      console.log('Session:', session ? 'exists' : 'none');
    }
  }
});

export type SupabaseClient = typeof supabase;