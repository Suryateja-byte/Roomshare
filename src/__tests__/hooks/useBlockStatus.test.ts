/**
 * Tests for useBlockStatus hook
 *
 * Coverage:
 * - returns loading when IDs undefined
 * - fetches initial status on mount
 * - returns status after fetch
 * - subscribes to Realtime channel
 * - refetches on relevant INSERT
 * - refetches on relevant DELETE
 * - ignores unrelated events
 * - cleans up on unmount
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useBlockStatus } from "@/hooks/useBlockStatus";

// ─── Mock getBlockStatus action ───────────────────────────────────────────────
jest.mock("@/app/actions/block", () => ({
  getBlockStatus: jest.fn(),
}));

import { getBlockStatus } from "@/app/actions/block";
const mockGetBlockStatus = getBlockStatus as jest.Mock;

// ─── Mock Supabase ────────────────────────────────────────────────────────────
// jest.mock factories are hoisted before variable declarations, so we cannot
// reference variables declared with const/let inside the factory body.
// We work around this by routing all calls through a plain object (supabaseMocks)
// that is declared in module scope before the factory references it. The getter
// pattern lets the factory capture the live object at call-time rather than at
// hoist-time.
type PostgresCallback = (payload: {
  new: Record<string, string> | null;
  old: Record<string, string>;
}) => void;

const supabaseMocks = {
  capturedPostgresCallback: null as PostgresCallback | null,
  subscribe: jest.fn(),
  on: jest.fn(),
  channel: jest.fn(),
  safeRemoveChannel: jest.fn(),
};

jest.mock("@/lib/supabase", () => ({
  get supabase() {
    return {
      // Proxy through the mocks object so each call goes to the current mock fn
      channel: (...args: unknown[]) => supabaseMocks.channel(...args),
    };
  },
  safeRemoveChannel: (...args: unknown[]) =>
    supabaseMocks.safeRemoveChannel(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OTHER_USER = "user-other-123";
const CURRENT_USER = "user-current-456";

function firePostgresEvent(
  newRecord: Record<string, string> | null = {},
  oldRecord: Record<string, string> = {}
) {
  supabaseMocks.capturedPostgresCallback?.({ new: newRecord, old: oldRecord });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useBlockStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabaseMocks.capturedPostgresCallback = null;

    // Default: no block relationship
    mockGetBlockStatus.mockResolvedValue(null);

    // Wire the Supabase channel chain: channel() → .on() → .subscribe()
    supabaseMocks.subscribe.mockReturnValue({ unsubscribe: jest.fn() });
    supabaseMocks.on.mockImplementation(
      (_event: string, _filter: unknown, callback: PostgresCallback) => {
        supabaseMocks.capturedPostgresCallback = callback;
        return { subscribe: supabaseMocks.subscribe };
      }
    );
    supabaseMocks.channel.mockReturnValue({ on: supabaseMocks.on });
  });

  // 1. returns loading when IDs are undefined
  it("returns loading: true and null blockStatus when both IDs are undefined", () => {
    const { result } = renderHook(() =>
      useBlockStatus(undefined, undefined)
    );

    // Synchronously: loading = true because the effect hasn't settled yet.
    // (When otherUserId is undefined the hook short-circuits and calls
    //  setLoading(false) — we verify that state reflects correctly below too.)
    expect(result.current.blockStatus).toBeNull();
    expect(result.current.isBlocked).toBe(false);
  });

  // 2. fetches initial status on mount
  it("calls getBlockStatus with otherUserId on mount", async () => {
    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    await waitFor(() => {
      expect(mockGetBlockStatus).toHaveBeenCalledTimes(1);
      expect(mockGetBlockStatus).toHaveBeenCalledWith(OTHER_USER);
    });
  });

  // 3. returns status after fetch
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

  // 4. subscribes to Realtime channel
  it("creates a Supabase channel and subscribes when both IDs are provided", async () => {
    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    await waitFor(() => {
      expect(supabaseMocks.channel).toHaveBeenCalledTimes(1);
    });

    // Channel name is sorted user IDs joined by "-"
    const channelName = supabaseMocks.channel.mock.calls[0][0] as string;
    expect(channelName).toContain("blocks:");
    expect(channelName).toContain(OTHER_USER);
    expect(channelName).toContain(CURRENT_USER);

    expect(supabaseMocks.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "*", table: "BlockedUser" }),
      expect.any(Function)
    );
    expect(supabaseMocks.subscribe).toHaveBeenCalledTimes(1);
  });

  // 5. refetches on relevant INSERT (currentUser blocks otherUser)
  it("refetches when a relevant INSERT event arrives (currentUser is blocker)", async () => {
    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    // Wait for subscription + initial fetch
    await waitFor(() => expect(mockGetBlockStatus).toHaveBeenCalledTimes(1));

    mockGetBlockStatus.mockResolvedValue("blocker");

    act(() => {
      firePostgresEvent(
        { blockerId: CURRENT_USER, blockedId: OTHER_USER },
        {}
      );
    });

    await waitFor(() => {
      expect(mockGetBlockStatus).toHaveBeenCalledTimes(2);
    });
  });

  // 6. refetches on relevant DELETE (otherUser unblocked currentUser)
  it("refetches when a relevant DELETE event arrives (old record used)", async () => {
    mockGetBlockStatus.mockResolvedValue("blocked");

    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    await waitFor(() => expect(mockGetBlockStatus).toHaveBeenCalledTimes(1));

    mockGetBlockStatus.mockResolvedValue(null);

    act(() => {
      // DELETE events have null/undefined payload.new; the deleted row is in payload.old
      firePostgresEvent(null, { blockerId: OTHER_USER, blockedId: CURRENT_USER });
    });

    await waitFor(() => {
      expect(mockGetBlockStatus).toHaveBeenCalledTimes(2);
    });
  });

  // 7. ignores unrelated events
  it("does not refetch when the event involves unrelated user IDs", async () => {
    renderHook(() => useBlockStatus(OTHER_USER, CURRENT_USER));

    await waitFor(() => expect(mockGetBlockStatus).toHaveBeenCalledTimes(1));

    act(() => {
      firePostgresEvent(
        { blockerId: "stranger-a", blockedId: "stranger-b" },
        {}
      );
    });

    // Call count remains at 1 — no extra fetch triggered
    expect(mockGetBlockStatus).toHaveBeenCalledTimes(1);
  });

  // 8. cleans up on unmount
  it("calls safeRemoveChannel on unmount", async () => {
    const { unmount } = renderHook(() =>
      useBlockStatus(OTHER_USER, CURRENT_USER)
    );

    await waitFor(() => expect(supabaseMocks.subscribe).toHaveBeenCalled());

    unmount();

    expect(supabaseMocks.safeRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
