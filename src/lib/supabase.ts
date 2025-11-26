import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Real-time features may not work.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
            params: {
                eventsPerSecond: 10
            }
        }
    })
    : null;

// Helper to create a chat room channel with broadcast and presence
export function createChatChannel(conversationId: string): RealtimeChannel | null {
    if (!supabase) return null;
    return supabase.channel(`chat:${conversationId}`, {
        config: {
            broadcast: { self: false },
            presence: { key: conversationId }
        }
    });
}

// Helper to broadcast typing status
export async function broadcastTyping(
    channel: RealtimeChannel | null,
    userId: string,
    userName: string,
    isTyping: boolean
): Promise<void> {
    if (!channel) return;
    await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, userName, isTyping }
    });
}

// Helper to track presence in a conversation
export async function trackPresence(
    channel: RealtimeChannel | null,
    userId: string,
    userName: string
): Promise<void> {
    if (!channel) return;
    await channel.track({
        online_at: new Date().toISOString(),
        user_id: userId,
        user_name: userName
    });
}
