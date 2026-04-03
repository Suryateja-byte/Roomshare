import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import CustomScrollContainer from "@/components/ui/CustomScrollContainer";
import { useScrollContainer } from "@/contexts/ScrollContainerContext";

function ScrollContainerProbe() {
  const scrollContainerRef = useScrollContainer();
  const [containerFlag, setContainerFlag] = React.useState("pending");

  React.useEffect(() => {
    setContainerFlag(
      scrollContainerRef.current?.getAttribute("data-app-scroll-container") ??
        "missing"
    );
  }, [scrollContainerRef]);

  return <div data-testid="scroll-container-probe" data-flag={containerFlag} />;
}

describe("CustomScrollContainer", () => {
  it("exposes the app scroll container hook and mobile scrollbar policy", async () => {
    render(
      <CustomScrollContainer className="test-scroll-shell">
        <ScrollContainerProbe />
        <div>Page content</div>
      </CustomScrollContainer>
    );

    const scrollContainer = document.querySelector(
      '[data-app-scroll-container="true"]'
    );

    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer).toHaveClass("overflow-y-auto");
    expect(scrollContainer).toHaveClass("hide-scrollbar-mobile");
    expect(scrollContainer).toHaveClass("test-scroll-shell");
    expect(screen.getByText("Page content")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("scroll-container-probe")).toHaveAttribute(
        "data-flag",
        "true"
      );
    });
  });
});
