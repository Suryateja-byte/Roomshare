import {
  mergeIncomingMessage,
  type MergeableMessage,
} from "@/lib/message-merge";

const CURRENT_USER_ID = "current-user";
const OTHER_USER_ID = "other-user";

function message(
  overrides: Partial<MergeableMessage> = {}
): MergeableMessage {
  return {
    id: "msg-1",
    content: "Hello",
    senderId: CURRENT_USER_ID,
    createdAt: new Date("2026-03-06T12:00:00.000Z"),
    ...overrides,
  };
}

describe("mergeIncomingMessage", () => {
  it("replaces a matching pending optimistic message when own realtime echo arrives before send resolves", () => {
    const pending = message({
      id: "opt-1700000000000",
      createdAt: new Date("2026-03-06T12:00:00.000Z"),
      sender: { name: "Current User", image: null },
    });
    const incoming = message({
      id: "real-1",
      createdAt: new Date("2026-03-06T12:00:01.000Z"),
    });

    const result = mergeIncomingMessage([pending], incoming, CURRENT_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      ...incoming,
      sender: pending.sender,
    });
  });

  it("ignores send resolution after realtime already replaced the optimistic message", () => {
    const real = message({
      id: "real-1",
      createdAt: new Date("2026-03-06T12:00:01.000Z"),
    });

    const result = mergeIncomingMessage([real], real, CURRENT_USER_ID);

    expect(result).toEqual([real]);
  });

  it("removes stale retry optimistic message when realtime appended before send resolution", () => {
    const staleRetry = message({
      id: "opt-stale-retry",
      createdAt: new Date("2026-03-06T11:55:00.000Z"),
      failed: false,
    });
    const realtimeEcho = message({
      id: "real-1",
      createdAt: new Date("2026-03-06T12:00:00.000Z"),
    });

    const afterRealtime = mergeIncomingMessage(
      [staleRetry],
      realtimeEcho,
      CURRENT_USER_ID
    );
    expect(afterRealtime).toEqual([staleRetry, realtimeEcho]);

    const afterSendResolution = mergeIncomingMessage(
      afterRealtime,
      realtimeEcho,
      CURRENT_USER_ID,
      { optimisticMessageId: "opt-stale-retry" }
    );

    expect(afterSendResolution).toEqual([realtimeEcho]);
  });

  it("appends messages from the other sender", () => {
    const existing = message({ id: "msg-existing", content: "First" });
    const incoming = message({
      id: "msg-other",
      content: "Reply",
      senderId: OTHER_USER_ID,
    });

    const result = mergeIncomingMessage(
      [existing],
      incoming,
      CURRENT_USER_ID
    );

    expect(result).toEqual([existing, incoming]);
  });

  it("ignores exact duplicate ids", () => {
    const existing = message({ id: "msg-duplicate" });
    const incoming = message({ id: "msg-duplicate", content: "Changed" });

    const result = mergeIncomingMessage(
      [existing],
      incoming,
      CURRENT_USER_ID
    );

    expect(result).toEqual([existing]);
  });
});
