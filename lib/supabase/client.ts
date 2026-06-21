// Browser Supabase client. Auth + saved-analysis history are OPTIONAL: if the
// env vars aren't set the app stays fully functional anonymously, and all
// account UI hides itself.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

/** Returns a singleton browser client, or null if Supabase isn't configured. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!cached) cached = createBrowserClient(url!, anonKey!);
  return cached;
}
