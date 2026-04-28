"use client";

import { useState, useEffect, useCallback } from "react";
import { getBlockStatus, type BlockStatus } from "@/app/actions/block";

interface UseBlockStatusResult {
  blockStatus: BlockStatus;
  isBlocked: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to track block status between current user and another user.
 * Uses the server action as the source of truth. Call refetch after local
 * block/unblock mutations to refresh the relationship without exposing block
 * rows through client-side database changes.
 *
 * @param otherUserId - The ID of the other user in the conversation
 * @param currentUserId - The ID of the current user
 * @returns Object with blockStatus, isBlocked boolean, loading state, and refetch function
 */
export function useBlockStatus(
  otherUserId: string | undefined,
  _currentUserId: string | undefined
): UseBlockStatusResult {
  const [blockStatus, setBlockStatus] = useState<BlockStatus>(null);
  const [loading, setLoading] = useState(true);

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
      console.error("Error fetching block status:", error);
      setBlockStatus(null);
    } finally {
      setLoading(false);
    }
  }, [otherUserId]);

  useEffect(() => {
    fetchBlockStatus();
  }, [fetchBlockStatus]);

  return {
    blockStatus,
    isBlocked: blockStatus !== null,
    loading,
    refetch: fetchBlockStatus,
  };
}
