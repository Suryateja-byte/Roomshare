'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, safeRemoveChannel } from '@/lib/supabase';
import { getBlockStatus, type BlockStatus } from '@/app/actions/block';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseBlockStatusResult {
    blockStatus: BlockStatus;
    isBlocked: boolean;
    loading: boolean;
    refetch: () => Promise<void>;
}

/**
 * Hook to track block status between current user and another user.
 * Provides real-time updates via Supabase Realtime subscription.
 *
 * @param otherUserId - The ID of the other user in the conversation
 * @param currentUserId - The ID of the current user
 * @returns Object with blockStatus, isBlocked boolean, loading state, and refetch function
 */
export function useBlockStatus(
    otherUserId: string | undefined,
    currentUserId: string | undefined
): UseBlockStatusResult {
    const [blockStatus, setBlockStatus] = useState<BlockStatus>(null);
    const [loading, setLoading] = useState(true);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const fetchBlockStatus = useCallback(async () => {
        if (!otherUserId) {
            setBlockStatus(null);
            setLoading(false);
            return;
        }

        try {
            const status = await getBlockStatus(otherUserId);
            setBlockStatus(status);
        } catch (error) {
            console.error('Error fetching block status:', error);
            setBlockStatus(null);
        } finally {
            setLoading(false);
        }
    }, [otherUserId]);

    useEffect(() => {
        // Initial fetch
        fetchBlockStatus();

        // Set up real-time subscription if Supabase is available
        if (!supabase || !otherUserId || !currentUserId) {
            return;
        }

        // Create a unique channel for this block relationship
        const channelName = `blocks:${[currentUserId, otherUserId].sort().join('-')}`;
        const channel = supabase.channel(channelName);

        channelRef.current = channel;

        channel
            .on('postgres_changes', {
                event: '*', // Listen for INSERT and DELETE
                schema: 'public',
                table: 'BlockedUser'
            }, (payload) => {
                // Check if this change affects our user pair
                const record = payload.new as any || payload.old as any;
                if (!record) return;

                const isRelevant = (
                    (record.blockerId === currentUserId && record.blockedId === otherUserId) ||
                    (record.blockerId === otherUserId && record.blockedId === currentUserId)
                );

                if (isRelevant) {
                    // Refetch to get accurate status
                    fetchBlockStatus();
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Subscribed to block status changes');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Failed to subscribe to block status changes');
                }
            });

        return () => {
            safeRemoveChannel(channelRef.current);
        };
    }, [otherUserId, currentUserId, fetchBlockStatus]);

    return {
        blockStatus,
        isBlocked: blockStatus !== null,
        loading,
        refetch: fetchBlockStatus
    };
}
