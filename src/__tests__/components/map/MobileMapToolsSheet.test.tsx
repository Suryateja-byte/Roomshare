import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import MobileMapToolsSheet from "@/components/map/MobileMapToolsSheet";
import type { POICategory } from "@/components/map/POILayer";

const baseProps = {
  activePOICategories: new Set<POICategory>(),
  onTogglePOICategory: jest.fn(),
  isDropMode: false,
  hasPin: false,
  onToggleDropMode: jest.fn(),
  onClearPin: jest.fn(),
};

function StatefulSheet(
  props: Partial<ComponentProps<typeof MobileMapToolsSheet>> = {}
) {
  const [open, setOpen] = useState(false);

  return (
    <MobileMapToolsSheet
      {...baseProps}
      {...props}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

describe("MobileMapToolsSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens a modal bottom sheet from the phone trigger with dialog semantics", async () => {
    const user = userEvent.setup();

    render(
      <StatefulSheet
        activePOICategories={new Set<POICategory>(["transit", "parks"])}
        hasPin={true}
      />
    );

    const trigger = screen.getByRole("button", {
      name: /more map tools, 3 active/i,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-map-tools-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-map-tools-overlay")).toBeInTheDocument();
  });

  it("does not render fit-all actions in the map tools sheet", async () => {
    const user = userEvent.setup();

    render(<StatefulSheet />);
    await user.click(screen.getByRole("button", { name: /more map tools/i }));
    expect(
      screen.queryByRole("button", { name: /fit all results in view/i })
    ).not.toBeInTheDocument();
  });

  it("invokes action callbacks and closes after selection", async () => {
    const user = userEvent.setup();
    const onToggleDropMode = jest.fn();

    render(
      <StatefulSheet
        onToggleDropMode={onToggleDropMode}
      />
    );

    await user.click(screen.getByRole("button", { name: /more map tools/i }));
    await user.click(screen.getByRole("button", { name: /^drop pin$/i }));
    expect(onToggleDropMode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
