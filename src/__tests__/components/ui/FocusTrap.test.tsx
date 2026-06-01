import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FocusTrap } from "@/components/ui/FocusTrap";

describe("FocusTrap", () => {
  it("cycles focus forward and backward inside the trap", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button>Before trap</button>
        <FocusTrap>
          <button>Close menu</button>
          <a href="/messages">Messages</a>
        </FocusTrap>
        <button>After trap</button>
      </>
    );

    const closeButton = screen.getByRole("button", { name: "Close menu" });
    const messagesLink = screen.getByRole("link", { name: "Messages" });

    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(messagesLink).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(messagesLink).toHaveFocus();
  });

  it("redirects tab focus back into the trap when focus starts outside", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button>Before trap</button>
        <FocusTrap>
          <button>Close menu</button>
          <a href="/messages">Messages</a>
        </FocusTrap>
        <button>After trap</button>
      </>
    );

    const closeButton = screen.getByRole("button", { name: "Close menu" });
    const messagesLink = screen.getByRole("link", { name: "Messages" });
    const afterTrapButton = screen.getByRole("button", { name: "After trap" });

    afterTrapButton.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    afterTrapButton.focus();
    await user.tab({ shift: true });
    expect(messagesLink).toHaveFocus();
  });
});
