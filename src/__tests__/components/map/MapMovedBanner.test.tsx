import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapMovedBanner } from "@/components/map/MapMovedBanner";

describe("MapMovedBanner", () => {
  const mockOnSearch = jest.fn();
  const mockOnReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("map variant", () => {
    it("renders Search this area button", () => {
      render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      expect(
        screen.getByRole("button", { name: /search this area/i }),
      ).toBeInTheDocument();
    });

    it("renders Reset button with accessible label", () => {
      render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      expect(
        screen.getByRole("button", { name: /reset map view/i }),
      ).toBeInTheDocument();
    });

    it("calls onSearch when Search this area is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /search this area/i }),
      );
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it("calls onReset when Reset is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      await user.click(screen.getByRole("button", { name: /reset map view/i }));
      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });

    it("has correct positioning classes for floating overlay", () => {
      const { container } = render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("absolute");
      expect(wrapper).toHaveClass("top-16");
      expect(wrapper).toHaveClass("-translate-x-1/2");
    });
  });

  describe("list variant", () => {
    it("renders message text", () => {
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      expect(
        screen.getByText(/map moved — results not updated/i),
      ).toBeInTheDocument();
    });

    it("renders Search this area button", () => {
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      expect(
        screen.getByRole("button", { name: /search this area/i }),
      ).toBeInTheDocument();
    });

    it("renders reset button with accessible label", () => {
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      expect(
        screen.getByRole("button", { name: /reset map view/i }),
      ).toBeInTheDocument();
    });

    it("calls onSearch when Search this area is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /search this area/i }),
      );
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it("calls onReset when reset button is clicked", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      await user.click(screen.getByRole("button", { name: /reset map view/i }));
      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });

    it("has amber background for warning style", () => {
      const { container } = render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("bg-amber");
    });

    it("renders MapPin icon", () => {
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      // MapPin icon should be present (lucide-react icons have role="img" or can be found via class)
      const icon = document.querySelector(".lucide-map-pin");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("map variant buttons are keyboard accessible", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="map"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      // Tab to first button and press Enter
      await user.tab();
      expect(
        screen.getByRole("button", { name: /search this area/i }),
      ).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });

    it("list variant buttons are keyboard accessible", async () => {
      const user = userEvent.setup();
      render(
        <MapMovedBanner
          variant="list"
          onSearch={mockOnSearch}
          onReset={mockOnReset}
        />,
      );

      // Tab to first button and press Enter
      await user.tab();
      expect(
        screen.getByRole("button", { name: /search this area/i }),
      ).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(mockOnSearch).toHaveBeenCalledTimes(1);
    });
  });
});
