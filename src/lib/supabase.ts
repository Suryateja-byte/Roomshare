import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Log configuration status at startup
if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[SUPABASE] Missing environment variables - real-time features disabled', {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseAnonKey,
        });
    } else {
        console.warn('[SUPABASE] Missing environment variables. Real-time features may not work.');
    }
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

// Track whether Supabase is available
export const isSupabaseAvailable = !!supabase;

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
    // Defensive check: ensure channel exists AND has send method
    if (!channel || typeof channel.send !== 'function') return;
    try {
        await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, userName, isTyping }
        });
    } catch (error) {
        // Log in development for debugging, silent in production
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[SUPABASE] Channel not ready for broadcast:', error);
        }
    }
}

// Helper to track presence in a conversation
export async function trackPresence(
    channel: RealtimeChannel | null,
    userId: string,
    userName: string
): Promise<void> {
    // P0 FIX: Defensive check and error handling for presence tracking
    if (!channel || typeof channel.track !== 'function') return;
    try {
        await channel.track({
            online_at: new Date().toISOString(),
            user_id: userId,
            user_name: userName
        });
    } catch (error) {
        // Log in development for debugging, silent in production
        // Presence is non-critical - don't crash the app
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[SUPABASE] Presence tracking failed:', error);
        }
    }
}
