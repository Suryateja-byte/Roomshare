import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DesktopMapControls, {
  getMapToolsPresentationMode,
} from "@/components/map/DesktopMapControls";
import type { POICategory } from "@/components/map/POILayer";

const defaultProps = {
  activePOICategories: new Set<POICategory>(),
  onTogglePOICategory: jest.fn(),
  isDropMode: false,
  hasPin: false,
  onToggleDropMode: jest.fn(),
  onClearPin: jest.fn(),
  onHideMap: jest.fn(),
  canFullscreen: true,
  isFullscreen: false,
  onToggleFullscreen: jest.fn(),
  paneWidth: 720,
  paneHeight: 720,
};

describe("DesktopMapControls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.documentElement.style.setProperty("--header-height", "136px");
  });

  it("chooses dropdown for roomy panes and sheet for constrained panes", () => {
    expect(
      getMapToolsPresentationMode({ paneWidth: 720, paneHeight: 720 })
    ).toBe("dropdown");
    expect(
      getMapToolsPresentationMode({ paneWidth: 420, paneHeight: 720 })
    ).toBe("sheet");
    expect(
      getMapToolsPresentationMode({ paneWidth: 720, paneHeight: 520 })
    ).toBe("sheet");
  });

  it("renders the primary desktop controls", () => {
    render(<DesktopMapControls {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: /hide map/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enter fullscreen map/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^map tools/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show all results on map/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /search as i move/i })
    ).not.toBeInTheDocument();
  });

  it("toggles fullscreen from the desktop rail", async () => {
    const user = userEvent.setup();
    render(<DesktopMapControls {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /enter fullscreen map/i }));

    expect(defaultProps.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("calls onHideMap from the overlay button", async () => {
    const user = userEvent.setup();
    render(<DesktopMapControls {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /hide map/i }));

    expect(defaultProps.onHideMap).toHaveBeenCalledTimes(1);
  });

  it("opens the tools menu and toggles POI categories in dropdown mode", async () => {
    const user = userEvent.setup();
    render(<DesktopMapControls {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /^map tools/i }));

    expect(screen.getByTestId("map-tools-dropdown")).toBeInTheDocument();
    expect(screen.getByTestId("map-tools-dropdown")).toHaveStyle(
      "max-height: calc(100dvh - 136px - 24px)"
    );

    const transit = await screen.findByRole("menuitemcheckbox", {
      name: /show transit/i,
    });
    expect(transit).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /show pois/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /show parks/i })
    ).toBeInTheDocument();

    await user.click(transit);
    expect(defaultProps.onTogglePOICategory).toHaveBeenCalledWith("transit");
  });

  it("shows pin actions inside the dropdown menu", async () => {
    const user = userEvent.setup();
    render(
      <DesktopMapControls
        {...defaultProps}
        hasPin={true}
        activePOICategories={new Set<POICategory>(["transit", "parks"])}
      />
    );

    expect(
      screen.getByRole("button", { name: /map tools, 3 active/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /map tools, 3 active/i }));

    await user.click(screen.getByTestId("map-tools-drop-pin"));
    expect(defaultProps.onToggleDropMode).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /map tools, 3 active/i }));
    await user.click(screen.getByTestId("map-tools-clear-pin"));
    expect(defaultProps.onClearPin).toHaveBeenCalledTimes(1);
  });

  it("falls back to a right-docked sheet on constrained panes", async () => {
    const user = userEvent.setup();
    render(
      <DesktopMapControls
        {...defaultProps}
        paneWidth={420}
        paneHeight={520}
        hasPin={true}
      />
    );

    await user.click(screen.getByTestId("map-tools-trigger"));

    expect(await screen.findByTestId("map-tools-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("map-tools-dropdown")).not.toBeInTheDocument();
    expect(
      screen.getByText(/layers and quick actions for the map/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show transit/i }));
    expect(defaultProps.onTogglePOICategory).toHaveBeenCalledWith("transit");

    await user.click(screen.getByTestId("map-tools-drop-pin"));
    expect(defaultProps.onToggleDropMode).toHaveBeenCalledTimes(1);
  });
});
