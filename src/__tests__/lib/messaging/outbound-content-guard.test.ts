import {
  recordOutboundContentSoftFlag,
  scanOutboundMessageContent,
} from "@/lib/messaging/outbound-content-guard";
import { logger } from "@/lib/logger";

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
    },
  },
}));

jest.mock("@/lib/messaging/cfm-messaging-telemetry", () => ({
  hashIdForLog: (value: string) => `hash:${value}`,
}));

describe("outbound content guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("soft-flags obvious phone and email leakage", () => {
    expect(
      scanOutboundMessageContent("Text me at 555-123-4567 or host@example.com")
    ).toEqual(["email", "phone"]);
  });

  it("does not flag ordinary message content", () => {
    expect(scanOutboundMessageContent("Is the room still available?")).toEqual(
      []
    );
  });

  it("records sanitized telemetry without raw message content", () => {
    recordOutboundContentSoftFlag({
      conversationId: "conv-1",
      userId: "user-1",
      flagKinds: ["phone"],
    });

    expect(logger.sync.warn).toHaveBeenCalledWith(
      "cfm.messaging.outbound_content_soft_flag",
      {
        conversationIdHash: "hash:conv-1",
        userIdHash: "hash:user-1",
        flagKinds: ["phone"],
        action: "sendMessage",
      }
    );
  });
});
