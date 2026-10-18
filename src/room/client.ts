// Supabase is used only for Realtime channels (broadcast + presence): no
// database tables, no player accounts. Both values are public by design;
// set them in .env.local (see .env.example).
import { createClient } from '@supabase/supabase-js';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { roomChannelName } from './protocol';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const roomsConfigured = Boolean(supabaseUrl && supabaseKey);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Private rooms need EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  client ??= createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export function openRoomChannel(code: string, memberId: string): RealtimeChannel {
  return getClient().channel(roomChannelName(code), {
    config: { broadcast: { self: false }, presence: { key: memberId } },
  });
}

export function closeRoomChannel(channel: RealtimeChannel) {
  void getClient().removeChannel(channel);
}
