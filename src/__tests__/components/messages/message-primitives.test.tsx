import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  DaySeparator,
  FailedMessageActions,
  MessageBubble,
  MessageComposer,
} from "@/components/messages";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/message-contract";

describe("message primitives", () => {
  it("exports the shared message max length contract", () => {
    expect(MESSAGE_MAX_LENGTH).toBe(2000);
  });

  it("renders a day separator with an accessible label", () => {
    render(
      <DaySeparator date="2026-03-06T12:00:00.000Z" label="Friday, March 6" />
    );

    expect(
      screen.getByRole("separator", { name: "Friday, March 6" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("message-day-separator")).toHaveTextContent(
      "Friday, March 6"
    );
  });

  it("renders sent and received message bubbles with timestamps", () => {
    render(
      <div>
        <MessageBubble
          content="Hello there"
          createdAt="2026-03-06T12:05:00.000Z"
          direction="sent"
          status="read"
        />
        <MessageBubble
          content="Welcome back"
          createdAt="2026-03-06T12:06:00.000Z"
          direction="received"
          senderName="Mina"
          showSenderName
        />
      </div>
    );

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Mina")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Hello there").closest("article")).toHaveClass(
      "bg-on-surface"
    );
  });

  it("renders sending and failed states with stable actions", async () => {
    const onRetry = jest.fn();
    const onDelete = jest.fn();

    render(
      <div>
        <MessageBubble
          content="Still sending"
          createdAt="2026-03-06T12:05:00.000Z"
          direction="sent"
          status="sending"
        />
        <MessageBubble
          content="Try again"
          createdAt="2026-03-06T12:06:00.000Z"
          direction="sent"
          status="failed"
          onRetry={onRetry}
          onDelete={onDelete}
        />
      </div>
    );

    expect(screen.getByText("Sending")).toBeInTheDocument();
    expect(screen.getByTestId("failed-message")).toHaveTextContent(
      "Failed to send"
    );

    await userEvent.click(screen.getByTestId("retry-message-button"));
    await userEvent.click(screen.getByTestId("delete-message-button"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders standalone failed message actions", async () => {
    const onRetry = jest.fn();
    const onDelete = jest.fn();

    render(<FailedMessageActions onRetry={onRetry} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders a controlled composer with counter and submit states", async () => {
    const onSubmit = jest.fn();

    function ComposerHarness() {
      const [value, setValue] = useState("");
      return (
        <MessageComposer
          value={value}
          onChange={setValue}
          onSubmit={onSubmit}
          maxLength={12}
        />
      );
    }

    render(<ComposerHarness />);

    const input = screen.getByRole("textbox", { name: "Message" });
    const submit = screen.getByRole("button", { name: "Send message" });

    expect(submit).toBeDisabled();
    expect(screen.getByTestId("message-composer-counter")).toHaveTextContent(
      "0/12"
    );

    await userEvent.type(input, "Hi");
    expect(screen.getByTestId("message-composer-counter")).toHaveTextContent(
      "2/12"
    );
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps the textarea editable while sending but blocks submit", () => {
    render(
      <MessageComposer
        value="Ready"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        isSending
      />
    );

    expect(
      screen.getByRole("textbox", { name: "Message" })
    ).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("sends on Enter", async () => {
    const onSubmit = jest.fn();

    function ComposerHarness() {
      const [value, setValue] = useState("");
      return (
        <MessageComposer value={value} onChange={setValue} onSubmit={onSubmit} />
      );
    }

    render(<ComposerHarness />);
    const input = screen.getByRole("textbox", { name: "Message" });

    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("inserts a newline on Shift+Enter without sending", async () => {
    const onSubmit = jest.fn();

    function ComposerHarness() {
      const [value, setValue] = useState("");
      return (
        <MessageComposer value={value} onChange={setValue} onSubmit={onSubmit} />
      );
    }

    render(<ComposerHarness />);
    const input = screen.getByRole("textbox", {
      name: "Message",
    }) as HTMLTextAreaElement;

    await userEvent.type(input, "Hi");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toContain("\n");
  });

  it("does not send on Enter while sending", () => {
    const onSubmit = jest.fn();
    render(
      <MessageComposer
        value="Ready"
        onChange={jest.fn()}
        onSubmit={onSubmit}
        isSending
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), {
      key: "Enter",
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores Enter during IME composition", () => {
    const onSubmit = jest.fn();
    render(
      <MessageComposer
        value="こんにちは"
        onChange={jest.fn()}
        onSubmit={onSubmit}
      />
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), {
      key: "Enter",
      isComposing: true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("autogrows with content and resets when cleared", () => {
    const { rerender } = render(
      <MessageComposer
        value="line one\nline two\nline three"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    const input = screen.getByRole("textbox", {
      name: "Message",
    }) as HTMLTextAreaElement;

    let mockedScrollHeight = 96;
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      get: () => mockedScrollHeight,
    });

    rerender(
      <MessageComposer
        value="line one\nline two\nline three\nline four"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );
    expect(input.style.height).toBe("96px");

    mockedScrollHeight = 44;
    rerender(
      <MessageComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />
    );
    expect(input.style.height).toBe("44px");
  });
});
