/**
 * Tests for useBlockStatus hook.
 *
 * Block status is fetched through the server action only. The hook must not
 * subscribe to BlockedUser database changes from the public Supabase client.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useBlockStatus } from "@/hooks/useBlockStatus";

jest.mock("@/app/actions/block", () => ({
  getBlockStatus: jest.fn(),
}));

const mockSupabase = {
  channel: jest.fn(),
  safeRemoveChannel: jest.fn(),
};

jest.mock("@/lib/supabase", () => ({
  supabase: {
    channel: (...args: unknown[]) => mockSupabase.channel(...args),
  },
  safeRemoveChannel: (...args: unknown[]) =>
    mockSupabase.safeRemoveChannel(...args),
}));

import { getBlockStatus } from "@/app/actions/block";

const mockGetBlockStatus = getBlockStatus as jest.Mock;
const OTHER_USER = "user-other-123";
const CURRENT_USER = "user-current-456";

describe("useBlockStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBlockStatus.mockResolvedValue(null);
  });

  it("returns null status without fetching when otherUserId is undefined", async () => {
    const { result } = renderHook(() => useBlockStatus(undefined, undefined));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.blockStatus).toBeNull();
    expect(result.current.isBlocked).toBe(false);
    expect(mockGetBlockStatus).not.toHaveBeenCalled();
  });

  it("fetches initial status on mount", async () => {
    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    await waitFor(() => {
      expect(mockGetBlockStatus).toHaveBeenCalledTimes(1);
      expect(mockGetBlockStatus).toHaveBeenCalledWith(OTHER_USER);
    });
  });

  it("returns the fetched blockStatus and sets loading to false", async () => {
    mockGetBlockStatus.mockResolvedValue("blocker");

    const { result } = renderHook(() =>
      useBlockStatus(OTHER_USER, CURRENT_USER)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.blockStatus).toBe("blocker");
      expect(result.current.isBlocked).toBe(true);
    });
  });

  it("refetches through the server action when requested", async () => {
    mockGetBlockStatus
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("blocked");

    const { result } = renderHook(() =>
      useBlockStatus(OTHER_USER, CURRENT_USER)
    );

    await waitFor(() => expect(mockGetBlockStatus).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockGetBlockStatus).toHaveBeenCalledTimes(2);
    expect(result.current.blockStatus).toBe("blocked");
  });

  it("does not subscribe to BlockedUser realtime changes", async () => {
    const { unmount } = renderHook(() =>
      useBlockStatus(OTHER_USER, CURRENT_USER)
    );

    await waitFor(() => expect(mockGetBlockStatus).toHaveBeenCalledTimes(1));
    unmount();

    expect(mockSupabase.channel).not.toHaveBeenCalled();
    expect(mockSupabase.safeRemoveChannel).not.toHaveBeenCalled();
  });
});
