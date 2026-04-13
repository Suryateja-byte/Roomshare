import { render, screen } from "@testing-library/react";
import { MobileMapStatusCard } from "@/components/map/MobileMapStatusCard";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("MobileMapStatusCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the confirmed-empty recovery actions", () => {
    render(
      <MobileMapStatusCard
        status="confirmed-empty"
        searchParams={
          new URLSearchParams("minPrice=1200&moveInDate=2026-05-01&roomType=private")
        }
        onZoomOut={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear filters/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /include near matches/i })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("mobile-map-status-filter-chips")
    ).toBeInTheDocument();
  });
});
