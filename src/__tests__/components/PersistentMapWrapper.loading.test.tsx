import { render, screen } from "@testing-library/react";

const mockSearchParams = new URLSearchParams();
let mockIsV2Enabled = false;
let mockV2MapData: unknown = null;
let mockPendingV2QueryHash: string | null = null;
const mockSetIsV2Enabled = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/DynamicMap", () => ({
  __esModule: true,
  default: () => <div data-testid="dynamic-map" />,
}));

jest.mock("@/contexts/SearchV2DataContext", () => ({
  useV2MapData: () => mockV2MapData,
  useIsV2Enabled: () => ({
    isV2Enabled: mockIsV2Enabled,
    setIsV2Enabled: mockSetIsV2Enabled,
  }),
  usePendingV2QueryHash: () => mockPendingV2QueryHash,
}));

jest.mock("@/contexts/ActivePanBoundsContext", () => ({
  useActivePanBoundsState: () => ({ activePanBounds: null }),
}));

jest.mock("@/contexts/SearchTestScenarioContext", () => ({
  useSearchTestScenario: () => null,
}));

jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: () => ({
    isPending: false,
    pendingReason: null,
  }),
}));

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import PersistentMapWrapper from "@/components/PersistentMapWrapper";

describe("PersistentMapWrapper loading placeholder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSearchParams.forEach((_value, key) => mockSearchParams.delete(key));
    mockIsV2Enabled = false;
    mockV2MapData = null;
    mockPendingV2QueryHash = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the polished map placeholder while the data path is unresolved", () => {
    render(<PersistentMapWrapper shouldRenderMap={true} />);

    const placeholder = screen.getByTestId("map-loading-placeholder");
    expect(placeholder).toHaveAttribute("role", "status");
    expect(placeholder).toHaveAttribute("aria-label", "Loading map");
    expect(screen.getByText("Loading map...")).toBeInTheDocument();
    expect(screen.getByText("Preparing nearby listings")).toBeInTheDocument();
    expect(placeholder.querySelector(".border-t-primary")).not.toBeNull();
    expect(
      placeholder.querySelectorAll('[class*="h-11"][class*="w-11"]')
    ).toHaveLength(4);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
