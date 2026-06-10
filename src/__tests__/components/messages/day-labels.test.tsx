import { render, screen } from "@testing-library/react";

import {
  DaySeparator,
  MessageThread,
  getThreadDayLabel,
  type ThreadMessage,
} from "@/components/messages";

const DAY_MS = 86_400_000;

function makeMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "msg-1",
    content: "Hello",
    senderId: "current-user",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("day labels", () => {
  beforeEach(() => {
    // Midday keeps calendar-day relationships stable across runner timezones.
    jest.useFakeTimers().setSystemTime(new Date("2026-03-08T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("labels the current day Today", () => {
    render(<DaySeparator date={new Date()} />);
    expect(screen.getByTestId("message-day-separator")).toHaveTextContent(
      "Today"
    );
  });

  it("labels the previous day Yesterday", () => {
    render(<DaySeparator date={new Date(Date.now() - DAY_MS)} />);
    expect(screen.getByTestId("message-day-separator")).toHaveTextContent(
      "Yesterday"
    );
  });

  it("keeps the full en-US label for older dates", () => {
    render(<DaySeparator date="2026-03-06T12:00:00.000Z" />);
    expect(screen.getByTestId("message-day-separator")).toHaveTextContent(
      "Friday, March 6, 2026"
    );
  });

  it("prefers an explicit label over the computed one", () => {
    render(<DaySeparator date={new Date()} label="Custom label" />);
    expect(screen.getByTestId("message-day-separator")).toHaveTextContent(
      "Custom label"
    );
  });

  it("exposes getThreadDayLabel with an injectable now", () => {
    const now = new Date("2026-03-08T12:00:00.000Z");
    expect(getThreadDayLabel(now, now)).toBe("Today");
    expect(getThreadDayLabel(new Date(now.getTime() - DAY_MS), now)).toBe(
      "Yesterday"
    );
    expect(getThreadDayLabel("2026-03-01T12:00:00.000Z", now)).toBe(
      "Sunday, March 1, 2026"
    );
  });

  it("renders Today, Yesterday, and full-date separators in a thread", () => {
    render(
      <MessageThread
        messages={[
          makeMessage({
            id: "msg-old",
            content: "Old message",
            createdAt: "2026-03-06T12:00:00.000Z",
          }),
          makeMessage({
            id: "msg-yesterday",
            content: "Yesterday message",
            createdAt: new Date(Date.now() - DAY_MS),
          }),
          makeMessage({
            id: "msg-today",
            content: "Today message",
            createdAt: new Date(),
          }),
        ]}
        currentUserId="current-user"
      />
    );

    const separators = screen.getAllByTestId("message-day-separator");
    expect(separators).toHaveLength(3);
    expect(screen.getByText("Friday, March 6, 2026")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});
