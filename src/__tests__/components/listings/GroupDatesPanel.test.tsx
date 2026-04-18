import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupDatesPanel from "@/components/listings/GroupDatesPanel";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { ListingData } from "@/lib/data";
import type { GroupSummary } from "@/lib/search-types";

const mockEmitSearchDedupOpenPanelClick = jest.fn();
const mockEmitSearchDedupMemberClick = jest.fn();

jest.mock("@/lib/search/search-telemetry-client", () => ({
  emitSearchDedupOpenPanelClick: (payload: unknown) =>
    mockEmitSearchDedupOpenPanelClick(payload),
  emitSearchDedupMemberClick: (payload: unknown) =>
    mockEmitSearchDedupMemberClick(payload),
}));

function createListing(overrides: Partial<ListingData> = {}): ListingData {
  return {
    id: "listing-mar20",
    title: "Dedupe Test Listing",
    description: "Test description",
    price: 1000,
    images: ["/test.jpg"],
    availableSlots: 1,
    totalSlots: 2,
    amenities: ["Wifi"],
    houseRules: ["No Smoking"],
    householdLanguages: ["en"],
    roomType: "Private Room",
    moveInDate: new Date("2026-03-20T00:00:00.000Z"),
    location: {
      city: "San Francisco",
      state: "CA",
      lat: 37.7749,
      lng: -122.4194,
    },
    publicAvailability: buildPublicAvailability({
      availableSlots: 1,
      totalSlots: 2,
      moveInDate: new Date("2026-03-20T00:00:00.000Z"),
    }),
    ...overrides,
  };
}

function createSummary(overrides: Partial<GroupSummary> = {}): GroupSummary {
  return {
    groupKey: "group-key-1",
    siblingIds: ["listing-apr18", "listing-may15"],
    availableFromDates: ["2026-03-20", "2026-04-18", "2026-05-15"],
    combinedOpenSlots: 3,
    combinedTotalSlots: 6,
    groupOverflow: false,
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  mockEmitSearchDedupOpenPanelClick.mockClear();
  mockEmitSearchDedupMemberClick.mockClear();
});

function Harness({
  summary = createSummary(),
  onMemberClick = jest.fn(),
  onOverflowClick = jest.fn(),
}: {
  summary?: GroupSummary;
  onMemberClick?: jest.Mock;
  onOverflowClick?: jest.Mock;
}) {
  const [open, setOpen] = useState(false);
  const panelId = "group-dates-panel-test";
  const triggerId = `${panelId}-trigger`;
  const canonical = createListing();

  return (
    <div>
      <button
        id={triggerId}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        +2 more dates
      </button>
      {open ? (
        <GroupDatesPanel
          canonical={canonical}
          summary={summary}
          panelId={panelId}
          triggerId={triggerId}
      onMemberClick={onMemberClick}
      onOverflowClick={onOverflowClick}
      queryHashPrefix8="cafebabe"
      onClose={() => {
        setOpen(false);
        document.getElementById(triggerId)?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

describe("GroupDatesPanel", () => {
  it("renders date chips from summary.availableFromDates", async () => {
    render(<Harness />);

    await userEvent.click(
      screen.getByRole("button", { name: /\+2 more dates/i })
    );

    const chips = screen.getAllByTestId("group-dates-chip");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent("Available Mar 20");
    expect(chips[1]).toHaveTextContent("Available Apr 18");
    expect(chips[2]).toHaveTextContent("Available May 15");
  });

  it("fires onMemberClick with the correct member id and index", async () => {
    const onMemberClick = jest.fn();
    render(<Harness onMemberClick={onMemberClick} />);

    await userEvent.click(
      screen.getByRole("button", { name: /\+2 more dates/i })
    );
    await userEvent.click(screen.getAllByTestId("group-dates-chip")[1]);

    expect(onMemberClick).toHaveBeenCalledWith("listing-apr18", 1);
    expect(mockEmitSearchDedupMemberClick).toHaveBeenCalledWith({
      groupSize: 3,
      memberIndex: 1,
    });
    expect(
      mockEmitSearchDedupMemberClick.mock.invocationCallOrder[0]
    ).toBeLessThan(onMemberClick.mock.invocationCallOrder[0]);
  });

  it('renders the "See all dates →" affordance when groupOverflow is true', async () => {
    render(<Harness summary={createSummary({ groupOverflow: true })} />);

    await userEvent.click(
      screen.getByRole("button", { name: /\+2 more dates/i })
    );

    expect(
      screen.getByRole("button", { name: /see all dates/i })
    ).toBeInTheDocument();
  });

  it("fires onMemberClick when Enter and Space are used on a chip", async () => {
    const onMemberClick = jest.fn();
    const user = userEvent.setup();
    render(<Harness onMemberClick={onMemberClick} />);

    await user.click(screen.getByRole("button", { name: /\+2 more dates/i }));
    const firstChip = screen.getAllByTestId("group-dates-chip")[0];

    firstChip.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onMemberClick).toHaveBeenNthCalledWith(1, "listing-mar20", 0);
    expect(onMemberClick).toHaveBeenNthCalledWith(2, "listing-mar20", 0);
  });

  it("keeps aria-expanded and aria-controls aligned with the trigger and panel", async () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /\+2 more dates/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "group-dates-panel-test");

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("region", { name: /\+2 more dates/i })
    ).toHaveAttribute("id", "group-dates-panel-test");
  });

  it("focuses the first chip on open and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /\+2 more dates/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getAllByTestId("group-dates-chip")[0]).toHaveFocus();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(trigger).toHaveFocus();
      expect(
        screen.queryByRole("region", { name: /\+2 more dates/i })
      ).not.toBeInTheDocument();
    });
  });

  it("emits an open-panel metric with the query hash prefix", async () => {
    render(<Harness />);

    await userEvent.click(
      screen.getByRole("button", { name: /\+2 more dates/i })
    );

    expect(mockEmitSearchDedupOpenPanelClick).toHaveBeenCalledWith({
      groupSize: 3,
      queryHashPrefix8: "cafebabe",
    });
  });
});
