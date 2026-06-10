import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { MessageThread, type ThreadMessage } from "@/components/messages";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/message-contract";

function makeMessage(
  overrides: Partial<ThreadMessage> = {}
): ThreadMessage {
  return {
    id: "msg-1",
    content: "Hello",
    senderId: "current-user",
    createdAt: "2026-03-06T12:00:00.000Z",
    ...overrides,
  };
}

describe("MessageThread", () => {
  it("groups messages by day and renders sent bubbles with the canonical surface token", () => {
    render(
      <MessageThread
        messages={[
          makeMessage({
            id: "msg-1",
            content: "First day",
            createdAt: "2026-03-06T12:00:00.000Z",
          }),
          makeMessage({
            id: "msg-2",
            content: "Next day",
            createdAt: "2026-03-07T12:00:00.000Z",
          }),
        ]}
        currentUserId="current-user"
      />
    );

    expect(screen.getAllByTestId("message-day-separator")).toHaveLength(2);
    expect(screen.getByText("Friday, March 6, 2026")).toBeInTheDocument();
    expect(screen.getByText("Saturday, March 7, 2026")).toBeInTheDocument();
    expect(screen.getByText("First day").closest("article")).toHaveClass(
      "bg-on-surface"
    );
  });

  it("wires composer submission through the shared message length contract", async () => {
    const onSubmit = jest.fn();

    function ThreadHarness() {
      const [value, setValue] = useState("");
      return (
        <MessageThread
          messages={[]}
          currentUserId="current-user"
          composer={{
            value,
            onChange: setValue,
            onSubmit,
            maxLength: MESSAGE_MAX_LENGTH,
          }}
        />
      );
    }

    render(<ThreadHarness />);

    const input = screen.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Shared composer");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("message-composer-counter")).toHaveTextContent(
      `15/${MESSAGE_MAX_LENGTH}`
    );
  });

  it("shows explicit retry and delete actions for failed messages", async () => {
    const onRetry = jest.fn();
    const onDelete = jest.fn();
    const failed = makeMessage({
      id: "opt-failed",
      content: "Please retry",
      failed: true,
    });

    render(
      <MessageThread
        messages={[failed]}
        currentUserId="current-user"
        onRetryMessage={onRetry}
        onDeleteFailedMessage={onDelete}
      />
    );

    await userEvent.click(screen.getByTestId("retry-message-button"));
    await userEvent.click(screen.getByTestId("delete-message-button"));

    expect(onRetry).toHaveBeenCalledWith(failed);
    expect(onDelete).toHaveBeenCalledWith("opt-failed");
  });

  it("exposes the message list as a labelled log region", () => {
    render(
      <MessageThread
        messages={[makeMessage()]}
        currentUserId="current-user"
        otherUserName="Mina"
      />
    );

    expect(
      screen.getByRole("log", { name: "Conversation with Mina" })
    ).toBeInTheDocument();
  });
});

describe("MessageThread autoAnchor", () => {
  const scrollIntoViewMock = jest.fn();

  beforeAll(() => {
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  beforeEach(() => {
    scrollIntoViewMock.mockClear();
  });

  function mockScrolledUp(container: HTMLElement, scrollTo: jest.Mock) {
    Object.defineProperty(container, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 200,
      writable: true,
    });
    Object.defineProperty(container, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
  }

  it("auto-anchors when the reader is near the bottom", () => {
    const { rerender } = render(
      <MessageThread
        messages={[makeMessage()]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    const callsAfterMount = scrollIntoViewMock.mock.calls.length;

    rerender(
      <MessageThread
        messages={[
          makeMessage(),
          makeMessage({ id: "msg-2", content: "Another" }),
        ]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(
      callsAfterMount
    );
    expect(screen.queryByTestId("jump-to-latest")).not.toBeInTheDocument();
  });

  it("shows the jump pill instead of scrolling when the reader is scrolled up", () => {
    const scrollTo = jest.fn();
    const { rerender } = render(
      <MessageThread
        messages={[makeMessage()]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    const container = screen.getByTestId("messages-container");
    mockScrolledUp(container, scrollTo);
    fireEvent.scroll(container);

    const callsAfterScroll = scrollIntoViewMock.mock.calls.length;

    rerender(
      <MessageThread
        messages={[
          makeMessage(),
          makeMessage({
            id: "msg-2",
            content: "From them",
            senderId: "other-user",
          }),
        ]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    expect(scrollIntoViewMock.mock.calls.length).toBe(callsAfterScroll);
    const pill = screen.getByRole("button", {
      name: "Scroll to latest messages",
    });

    fireEvent.click(pill);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(screen.queryByTestId("jump-to-latest")).not.toBeInTheDocument();
  });

  it("force-anchors for the reader's own outgoing message while scrolled up", () => {
    const scrollTo = jest.fn();
    const { rerender } = render(
      <MessageThread
        messages={[makeMessage()]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    const container = screen.getByTestId("messages-container");
    mockScrolledUp(container, scrollTo);
    fireEvent.scroll(container);

    const callsAfterScroll = scrollIntoViewMock.mock.calls.length;

    rerender(
      <MessageThread
        messages={[
          makeMessage(),
          makeMessage({ id: "opt-2", content: "My reply" }),
        ]}
        currentUserId="current-user"
        autoAnchor
      />
    );

    expect(scrollIntoViewMock.mock.calls.length).toBeGreaterThan(
      callsAfterScroll
    );
    expect(screen.queryByTestId("jump-to-latest")).not.toBeInTheDocument();
  });

  it("still calls the consumer onMessagesScroll when autoAnchor is on", () => {
    const onMessagesScroll = jest.fn();
    render(
      <MessageThread
        messages={[makeMessage()]}
        currentUserId="current-user"
        autoAnchor
        onMessagesScroll={onMessagesScroll}
      />
    );

    fireEvent.scroll(screen.getByTestId("messages-container"));
    expect(onMessagesScroll).toHaveBeenCalledTimes(1);
  });
});
