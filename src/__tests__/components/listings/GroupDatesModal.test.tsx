import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupDatesModal from "@/components/listings/GroupDatesModal";
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
    title: "Dedupe Modal Listing",
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
    groupKey: "group-key-modal",
    siblingIds: ["listing-apr18", "listing-may15", "listing-jun01"],
    availableFromDates: [
      "2026-03-20",
      "2026-04-18",
      "2026-05-15",
      "2026-06-01",
    ],
    combinedOpenSlots: 4,
    combinedTotalSlots: 8,
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
  initialOpen = true,
  summary = createSummary(),
}: {
  initialOpen?: boolean;
  summary?: GroupSummary;
}) {
  const [open, setOpen] = useState(initialOpen);

  return (
    <div>
      <button type="button">Outside button</button>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <GroupDatesModal
        canonical={createListing()}
        summary={summary}
        queryHashPrefix8="feedface"
        panelId="group-dates-modal-test"
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

describe("GroupDatesModal", () => {
  it("renders open and close states", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getAllByRole("button", { name: /close/i })[0]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps focus trapped inside the dialog while open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = screen.getByRole("dialog");
    const outsideButton = screen.getByText("Outside button");

    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
    });

    for (let index = 0; index < 5; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement | null);
      expect(outsideButton).not.toHaveFocus();
    }
  });

  it("renders plural and singular titles from sibling count", async () => {
    const { rerender } = render(<Harness summary={createSummary()} />);

    expect(
      screen.getByRole("heading", { name: /3 other move-in dates available/i })
    ).toBeInTheDocument();

    rerender(
      <Harness
        summary={createSummary({
          siblingIds: ["listing-apr18"],
          availableFromDates: ["2026-03-20", "2026-04-18"],
        })}
      />
    );

    expect(
      screen.getByRole("heading", { name: /1 other move-in date available/i })
    ).toBeInTheDocument();
  });

  it("emits panel-open and member-click telemetry", async () => {
    const onMemberClick = jest.fn();
    const user = userEvent.setup();
    render(
      <div>
        <GroupDatesModal
          canonical={createListing()}
          summary={createSummary()}
          queryHashPrefix8="feedface"
          panelId="group-dates-modal-test"
          open={true}
          onClose={jest.fn()}
          onMemberClick={onMemberClick}
        />
      </div>
    );

    expect(mockEmitSearchDedupOpenPanelClick).toHaveBeenCalledWith({
      groupSize: 4,
      queryHashPrefix8: "feedface",
    });

    await user.click(screen.getAllByTestId("group-dates-chip")[2]);

    expect(mockEmitSearchDedupMemberClick).toHaveBeenCalledWith({
      groupSize: 4,
      memberIndex: 2,
    });
    expect(onMemberClick).toHaveBeenCalledWith("listing-may15", 2);
  });
});
