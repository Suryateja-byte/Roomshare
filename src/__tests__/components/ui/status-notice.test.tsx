import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusNotice } from "@/components/ui/status-notice";

const rawStatusColorPattern = /\b(?:bg|text|border)-(?:red|green|blue|yellow|amber)-/;

function expectNoRawStatusColors(container: HTMLElement) {
  const classNames = Array.from(container.querySelectorAll("[class]")).map(
    (element) => element.getAttribute("class") ?? ""
  );

  expect(classNames.join(" ")).not.toMatch(rawStatusColorPattern);
}

describe("StatusNotice", () => {
  it.each(["info", "warning", "error", "success", "neutral"] as const)(
    "renders the %s variant with tokenized classes",
    (variant) => {
      const { container } = render(
        <StatusNotice variant={variant} title={`${variant} title`}>
          Notice body
        </StatusNotice>
      );

      expect(screen.getByText(`${variant} title`)).toBeInTheDocument();
      expect(screen.getByText("Notice body")).toBeInTheDocument();
      expectNoRawStatusColors(container);
    }
  );

  it("preserves forwarded role attributes", () => {
    render(
      <StatusNotice role="alert" variant="error">
        Something failed
      </StatusNotice>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
  });

  it("renders actions and preserves action behavior", async () => {
    const handleClick = jest.fn();

    render(
      <StatusNotice
        title="Draft available"
        actions={<button onClick={handleClick}>Restore</button>}
      >
        Last saved recently
      </StatusNotice>
    );

    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
