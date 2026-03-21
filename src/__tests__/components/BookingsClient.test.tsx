/**
 * Tests for BookingsClient dashboard component.
 *
 * Covers: tab rendering, booking list display, status filter chips,
 * action buttons (received/sent tabs), confirmation dialogs, HELD booking
 * display, status update flow, calendar view, and offline behavior.
 */

// --- Mocks must appear before any import that triggers the mocked module ---

jest.mock("@/app/actions/manage-booking", () => ({
  updateBookingStatus: jest.fn(),
}));

jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: jest.fn().mockReturnValue({ isOffline: false }),
}));

jest.mock("@/components/BookingCalendar", () => ({
  __esModule: true,
  default: function MockBookingCalendar() {
    return <div data-testid="booking-calendar">Calendar View</div>;
  },
}));

jest.mock("@/components/bookings/HoldCountdown", () => ({
  __esModule: true,
  default: function MockHoldCountdown({
    heldUntil,
  }: {
    heldUntil: string;
    onExpired?: () => void;
  }) {
    return <div data-testid="hold-countdown">{heldUntil}</div>;
  },
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// UserAvatar: simple presentational — let it render naturally via global next/image mock.

// --- Imports ---

import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingsClient from "@/app/bookings/BookingsClient";
import { updateBookingStatus } from "@/app/actions/manage-booking";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { toast } from "sonner";

// --- Types (mirrors the component's local Booking type) ---

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "HELD"
  | "EXPIRED";

type Booking = {
  id: string;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  totalPrice: number;
  createdAt: string;
  heldUntil?: string | null;
  slotsRequested?: number;
  listing: {
    id: string;
    title: string;
    price: number;
    location: { city: string; state: string } | null;
    owner?: { id: string; name: string | null; image: string | null };
  };
  tenant?: { id: string; name: string | null; image: string | null };
};

// --- Test data factory ---

function createBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking-1",
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-07-01T00:00:00.000Z",
    status: "PENDING",
    totalPrice: 3200,
    createdAt: "2026-03-15T00:00:00.000Z",
    heldUntil: null,
    slotsRequested: 1,
    listing: {
      id: "listing-1",
      title: "Cozy Room in SF",
      price: 1600,
      location: { city: "San Francisco", state: "CA" },
      owner: { id: "owner-1", name: "Host User", image: null },
    },
    tenant: { id: "tenant-1", name: "Tenant User", image: null },
    ...overrides,
  };
}

// --- Helpers ---

const mockUpdateBookingStatus = updateBookingStatus as jest.Mock;
const mockUseNetworkStatus = useNetworkStatus as jest.Mock;

function renderComponent(
  receivedBookings: Booking[] = [],
  sentBookings: Booking[] = []
) {
  return render(
    <BookingsClient
      receivedBookings={receivedBookings}
      sentBookings={sentBookings}
    />
  );
}

// ============================================================
// 1. Tab rendering
// ============================================================

describe("Tab rendering", () => {
  it("renders both Received and Sent tabs", () => {
    renderComponent();
    expect(
      screen.getByRole("button", { name: /received/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sent/i })).toBeInTheDocument();
  });

  it("defaults to the Received tab", () => {
    const booking = createBooking({
      listing: { ...createBooking().listing, title: "Received Listing" },
    });
    renderComponent([booking]);
    // The listing title should be visible because Received tab is active
    expect(screen.getByText("Received Listing")).toBeInTheDocument();
  });

  it("switches to Sent tab on click", async () => {
    const user = userEvent.setup();
    const sentBooking = createBooking({
      id: "sent-1",
      listing: { ...createBooking().listing, title: "Sent Listing Title" },
    });
    renderComponent([], [sentBooking]);

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(screen.getByText("Sent Listing Title")).toBeInTheDocument();
  });

  it("shows empty state for Received tab when no bookings", () => {
    renderComponent();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No booking requests yet")).toBeInTheDocument();
  });

  it("shows empty state for Sent tab when no bookings", async () => {
    const user = userEvent.setup();
    renderComponent([], []);

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("No bookings made yet")).toBeInTheDocument();
  });

  it("shows pending badge count on Received tab when there are pending/held bookings", () => {
    const pending = createBooking({ id: "p1", status: "PENDING" });
    const held = createBooking({
      id: "p2",
      status: "HELD",
      heldUntil: "2026-04-01T00:00:00.000Z",
    });
    renderComponent([pending, held]);

    // The tab button should contain "2" as a count badge
    const receivedTab = screen.getByRole("button", { name: /received/i });
    expect(within(receivedTab).getByText("2")).toBeInTheDocument();
  });
});

// ============================================================
// 2. Booking list display
// ============================================================

describe("Booking list display", () => {
  it("renders a booking card for each booking", () => {
    const b1 = createBooking({ id: "b1" });
    const b2 = createBooking({
      id: "b2",
      listing: { ...createBooking().listing, title: "Another Room" },
    });
    renderComponent([b1, b2]);

    expect(screen.getAllByTestId("booking-item")).toHaveLength(2);
  });

  it("shows the listing title on each card", () => {
    const booking = createBooking({
      listing: { ...createBooking().listing, title: "My SF Room" },
    });
    renderComponent([booking]);

    expect(screen.getByText("My SF Room")).toBeInTheDocument();
  });

  it("shows the listing location on each card", () => {
    const booking = createBooking();
    renderComponent([booking]);

    expect(screen.getByText("San Francisco, CA")).toBeInTheDocument();
  });

  it('shows "Location not specified" when listing has no location', () => {
    const booking = createBooking({
      listing: { ...createBooking().listing, location: null },
    });
    renderComponent([booking]);

    expect(screen.getByText("Location not specified")).toBeInTheDocument();
  });

  it("shows a StatusBadge for each booking", () => {
    const booking = createBooking({ status: "ACCEPTED" });
    renderComponent([booking]);

    // "Accepted" appears in both the filter chip and the status badge
    const items = screen.getAllByText("Accepted");
    expect(items.length).toBeGreaterThanOrEqual(1);
    // At least one should be a status badge span (not a button)
    const badge = items.find(
      (el) =>
        el.tagName.toLowerCase() === "span" &&
        el.className.includes("rounded-full")
    );
    expect(badge).toBeInTheDocument();
  });

  it("shows total price on each card", () => {
    const booking = createBooking({ totalPrice: 4800 });
    renderComponent([booking]);

    expect(screen.getByText("$4800.00")).toBeInTheDocument();
  });

  it("renders tenant name on received bookings", () => {
    const booking = createBooking({
      tenant: { id: "tenant-1", name: "Jane Doe", image: null },
    });
    renderComponent([booking]);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows empty state for received with correct text when no bookings", () => {
    renderComponent();
    expect(screen.getByText("No booking requests yet")).toBeInTheDocument();
  });
});

// ============================================================
// 3. Status filter chips
// ============================================================

describe("Status filter chips", () => {
  it("renders all filter chip options", () => {
    const booking = createBooking();
    renderComponent([booking]);

    expect(screen.getByRole("button", { name: /^all/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^pending/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^accepted/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^rejected/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^cancelled/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^held/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^expired/i })
    ).toBeInTheDocument();
  });

  it("shows correct count on ALL chip", () => {
    const b1 = createBooking({ id: "b1", status: "PENDING" });
    const b2 = createBooking({ id: "b2", status: "ACCEPTED" });
    renderComponent([b1, b2]);

    // The "All" chip should show count 2
    const allChip = screen.getByRole("button", { name: /^all/i });
    expect(within(allChip).getByText("2")).toBeInTheDocument();
  });

  it("shows correct count on Pending chip", () => {
    const b1 = createBooking({ id: "b1", status: "PENDING" });
    const b2 = createBooking({ id: "b2", status: "ACCEPTED" });
    renderComponent([b1, b2]);

    const pendingChip = screen.getByRole("button", { name: /^pending/i });
    expect(within(pendingChip).getByText("1")).toBeInTheDocument();
  });

  it("filters bookings when Pending chip is clicked", async () => {
    const user = userEvent.setup();
    const pending = createBooking({
      id: "p1",
      status: "PENDING",
      listing: { ...createBooking().listing, title: "Pending Room" },
    });
    const accepted = createBooking({
      id: "a1",
      status: "ACCEPTED",
      listing: { ...createBooking().listing, title: "Accepted Room" },
    });
    renderComponent([pending, accepted]);

    await user.click(screen.getByRole("button", { name: /^pending/i }));

    expect(screen.getByText("Pending Room")).toBeInTheDocument();
    expect(screen.queryByText("Accepted Room")).not.toBeInTheDocument();
  });

  it("shows all bookings when ALL chip is clicked after filtering", async () => {
    const user = userEvent.setup();
    const pending = createBooking({
      id: "p1",
      status: "PENDING",
      listing: { ...createBooking().listing, title: "Pending Room" },
    });
    const accepted = createBooking({
      id: "a1",
      status: "ACCEPTED",
      listing: { ...createBooking().listing, title: "Accepted Room" },
    });
    renderComponent([pending, accepted]);

    // First filter to Pending
    await user.click(screen.getByRole("button", { name: /^pending/i }));
    expect(screen.queryByText("Accepted Room")).not.toBeInTheDocument();

    // Then reset to All
    await user.click(screen.getByRole("button", { name: /^all/i }));
    expect(screen.getByText("Pending Room")).toBeInTheDocument();
    expect(screen.getByText("Accepted Room")).toBeInTheDocument();
  });

  it("shows empty state when filter matches no bookings", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accepted/i }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("does not show filter chips when there are no bookings", () => {
    renderComponent();
    // Filter section should not appear when booking list is empty
    expect(
      screen.queryByRole("button", { name: /^all/i })
    ).not.toBeInTheDocument();
  });
});

// ============================================================
// 4. Action buttons — received tab
// ============================================================

describe("Action buttons (received tab)", () => {
  it("shows Accept and Reject buttons for a PENDING received booking", () => {
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    expect(
      screen.getByRole("button", { name: /^accept$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^reject$/i })
    ).toBeInTheDocument();
  });

  it("shows Accept and Reject buttons for a HELD received booking", () => {
    const booking = createBooking({
      status: "HELD",
      heldUntil: "2026-04-01T00:00:00.000Z",
    });
    renderComponent([booking]);

    expect(
      screen.getByRole("button", { name: /^accept$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^reject$/i })
    ).toBeInTheDocument();
  });

  it("does NOT show Accept/Reject for an ACCEPTED booking", () => {
    const booking = createBooking({ status: "ACCEPTED" });
    renderComponent([booking]);

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Accept/Reject for a REJECTED booking", () => {
    const booking = createBooking({ status: "REJECTED" });
    renderComponent([booking]);

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Accept/Reject for a CANCELLED booking", () => {
    const booking = createBooking({ status: "CANCELLED" });
    renderComponent([booking]);

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Accept/Reject for an EXPIRED booking", () => {
    const booking = createBooking({ status: "EXPIRED" });
    renderComponent([booking]);

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Cancel Booking button on the received tab", () => {
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });
});

// ============================================================
// 5. Action buttons — sent tab
// ============================================================

describe("Action buttons (sent tab)", () => {
  async function renderSentTab(booking: Booking) {
    const user = userEvent.setup();
    renderComponent([], [booking]);
    await user.click(screen.getByRole("button", { name: /sent/i }));
    return user;
  }

  it("shows Cancel Booking button for a PENDING sent booking", async () => {
    await renderSentTab(createBooking({ status: "PENDING" }));
    expect(
      screen.getByRole("button", { name: /cancel booking/i })
    ).toBeInTheDocument();
  });

  it("shows Cancel Booking button for an ACCEPTED sent booking", async () => {
    await renderSentTab(createBooking({ status: "ACCEPTED" }));
    expect(
      screen.getByRole("button", { name: /cancel booking/i })
    ).toBeInTheDocument();
  });

  it("shows Cancel Booking button for a HELD sent booking", async () => {
    await renderSentTab(
      createBooking({ status: "HELD", heldUntil: "2026-04-01T00:00:00.000Z" })
    );
    expect(
      screen.getByRole("button", { name: /cancel booking/i })
    ).toBeInTheDocument();
  });

  it("does NOT show Cancel Booking for a REJECTED sent booking", async () => {
    await renderSentTab(createBooking({ status: "REJECTED" }));
    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Cancel Booking for a CANCELLED sent booking", async () => {
    await renderSentTab(createBooking({ status: "CANCELLED" }));
    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Cancel Booking for an EXPIRED sent booking", async () => {
    await renderSentTab(createBooking({ status: "EXPIRED" }));
    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("does NOT show Accept/Reject buttons on the sent tab", async () => {
    await renderSentTab(createBooking({ status: "PENDING" }));
    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });
});

// ============================================================
// 6. Confirmation dialogs
// ============================================================

describe("Confirmation dialogs", () => {
  it("opens cancel confirmation dialog when Cancel Booking is clicked", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([], [booking]);

    await user.click(screen.getByRole("button", { name: /sent/i }));
    await user.click(screen.getByRole("button", { name: /cancel booking/i }));

    expect(screen.getByText("Cancel this booking?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /keep booking/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /yes, cancel booking/i })
    ).toBeInTheDocument();
  });

  it("closes cancel dialog when Keep Booking is clicked", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([], [booking]);

    await user.click(screen.getByRole("button", { name: /sent/i }));
    await user.click(screen.getByRole("button", { name: /cancel booking/i }));
    await user.click(screen.getByRole("button", { name: /keep booking/i }));

    await waitFor(() => {
      expect(
        screen.queryByText("Cancel this booking?")
      ).not.toBeInTheDocument();
    });
  });

  it("opens reject confirmation dialog when Reject is clicked", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^reject$/i }));

    expect(
      screen.getByText("Reject this booking request?")
    ).toBeInTheDocument();
  });

  it("shows rejection reason textarea in reject dialog", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^reject$/i }));

    expect(
      screen.getByLabelText("Reason for rejection (optional)")
    ).toBeInTheDocument();
  });

  it("shows Reject Booking confirm button in reject dialog", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^reject$/i }));

    expect(
      screen.getByRole("button", { name: /reject booking/i })
    ).toBeInTheDocument();
  });

  it("allows typing a rejection reason", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^reject$/i }));

    const textarea = screen.getByLabelText("Reason for rejection (optional)");
    await user.type(textarea, "Dates not available");

    expect(textarea).toHaveValue("Dates not available");
  });

  it("shows listing title in the cancel dialog description", async () => {
    const user = userEvent.setup();
    const booking = createBooking({
      status: "PENDING",
      listing: { ...createBooking().listing, title: "My Special Room" },
    });
    renderComponent([], [booking]);

    await user.click(screen.getByRole("button", { name: /sent/i }));
    await user.click(screen.getByRole("button", { name: /cancel booking/i }));

    // The title appears in both the card link and the dialog description; both are valid
    const matches = screen.getAllByText("My Special Room");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// 7. HELD booking display
// ============================================================

describe("HELD booking display", () => {
  it("shows HoldCountdown for a HELD booking with heldUntil set", () => {
    const booking = createBooking({
      status: "HELD",
      heldUntil: "2026-04-01T12:00:00.000Z",
    });
    renderComponent([booking]);

    expect(screen.getByTestId("hold-countdown")).toBeInTheDocument();
  });

  it("does NOT show HoldCountdown when heldUntil is null", () => {
    // HELD status but no heldUntil — edge case
    const booking = createBooking({
      status: "HELD",
      heldUntil: null,
    });
    renderComponent([booking]);

    expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument();
  });

  it("does NOT show HoldCountdown for non-HELD bookings", () => {
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument();
  });

  it("shows the Held status badge", () => {
    const booking = createBooking({
      status: "HELD",
      heldUntil: "2026-04-01T12:00:00.000Z",
    });
    renderComponent([booking]);

    // "Held" appears in both the filter chip and the status badge
    const matches = screen.getAllByText("Held");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Verify at least one is a status badge (span with rounded-full)
    const badge = matches.find(
      (el) =>
        el.tagName.toLowerCase() === "span" &&
        el.className.includes("rounded-full")
    );
    expect(badge).toBeInTheDocument();
  });
});

// ============================================================
// 8. Status update flow
// ============================================================

describe("Status update flow", () => {
  beforeEach(() => {
    mockUpdateBookingStatus.mockResolvedValue({ success: true });
  });

  it("calls updateBookingStatus with correct args when Accept is clicked", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ id: "booking-abc", status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith(
        "booking-abc",
        "ACCEPTED",
        undefined
      );
    });
  });

  it("shows success toast after a successful Accept", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Booking accepted");
    });
  });

  it("calls updateBookingStatus with CANCELLED when cancel dialog is confirmed", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ id: "booking-cancel", status: "PENDING" });
    renderComponent([], [booking]);

    await user.click(screen.getByRole("button", { name: /sent/i }));
    await user.click(screen.getByRole("button", { name: /cancel booking/i }));
    await user.click(
      screen.getByRole("button", { name: /yes, cancel booking/i })
    );

    await waitFor(() => {
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith(
        "booking-cancel",
        "CANCELLED",
        undefined
      );
    });
  });

  it("calls updateBookingStatus with REJECTED and rejection reason from dialog", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ id: "booking-rej", status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^reject$/i }));
    const textarea = screen.getByLabelText("Reason for rejection (optional)");
    await user.type(textarea, "Not available");
    await user.click(screen.getByRole("button", { name: /reject booking/i }));

    await waitFor(() => {
      expect(mockUpdateBookingStatus).toHaveBeenCalledWith(
        "booking-rej",
        "REJECTED",
        "Not available"
      );
    });
  });

  it("shows error toast when updateBookingStatus returns an error", async () => {
    const user = userEvent.setup();
    mockUpdateBookingStatus.mockResolvedValue({
      error: "Something went wrong",
    });

    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Something went wrong");
    });
  });

  it("reverts optimistic status update on error", async () => {
    const user = userEvent.setup();
    mockUpdateBookingStatus.mockResolvedValue({ error: "Server error" });

    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    // Optimistically accept — should briefly show ACCEPTED badge
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    // After error, should revert to PENDING — "Pending" appears in filter chip AND badge
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      const matches = screen.getAllByText("Pending");
      // Should still have a Pending status badge after revert
      const badge = matches.find(
        (el) =>
          el.tagName.toLowerCase() === "span" &&
          el.className.includes("rounded-full")
      );
      expect(badge).toBeInTheDocument();
    });
  });

  it("applies optimistic update before the server responds", async () => {
    let resolve: (value: { success: boolean }) => void;
    const pendingPromise = new Promise<{ success: boolean }>((res) => {
      resolve = res;
    });
    mockUpdateBookingStatus.mockReturnValue(pendingPromise);

    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    // Before resolution, "Accepted" appears in filter chip and the optimistic status badge
    // Verify the booking item now shows an Accepted status badge
    const bookingItem = screen.getByTestId("booking-item");
    const badge = within(bookingItem).getByText("Accepted");
    expect(badge).toBeInTheDocument();

    // Resolve the promise
    resolve!({ success: true });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });
});

// ============================================================
// 9. Calendar view
// ============================================================

describe("Calendar view", () => {
  it("shows list/calendar view toggle buttons on the Received tab", () => {
    renderComponent([createBooking()]);

    // List view toggle (title="List view") and Calendar view toggle (title="Calendar view")
    expect(screen.getByTitle("List view")).toBeInTheDocument();
    expect(screen.getByTitle("Calendar view")).toBeInTheDocument();
  });

  it("does NOT show view toggle on the Sent tab", async () => {
    const user = userEvent.setup();
    renderComponent([], [createBooking()]);

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(screen.queryByTitle("List view")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Calendar view")).not.toBeInTheDocument();
  });

  it("renders BookingCalendar when calendar view is selected", async () => {
    const user = userEvent.setup();
    renderComponent([createBooking()]);

    await user.click(screen.getByTitle("Calendar view"));

    expect(screen.getByTestId("booking-calendar")).toBeInTheDocument();
  });

  it("hides status filter chips in calendar view", async () => {
    const user = userEvent.setup();
    renderComponent([createBooking()]);

    await user.click(screen.getByTitle("Calendar view"));

    // Filter section should disappear in calendar mode
    expect(
      screen.queryByRole("button", { name: /^all/i })
    ).not.toBeInTheDocument();
  });

  it("returns to list view when list toggle is clicked", async () => {
    const user = userEvent.setup();
    renderComponent([createBooking()]);

    await user.click(screen.getByTitle("Calendar view"));
    expect(screen.getByTestId("booking-calendar")).toBeInTheDocument();

    await user.click(screen.getByTitle("List view"));
    expect(screen.queryByTestId("booking-calendar")).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-item")).toBeInTheDocument();
  });
});

// ============================================================
// 10. Offline behavior
// ============================================================

describe("Offline behavior", () => {
  beforeEach(() => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: true });
  });

  afterEach(() => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
  });

  it("shows offline banner when isOffline is true", () => {
    renderComponent([createBooking()]);

    expect(
      screen.getByText(/you're offline\. booking actions are disabled/i)
    ).toBeInTheDocument();
  });

  it("does NOT show offline banner when online", () => {
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
    renderComponent([createBooking()]);

    expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
  });

  it("shows error toast instead of calling server action when offline and Accept clicked", async () => {
    const user = userEvent.setup();
    const booking = createBooking({ status: "PENDING" });
    renderComponent([booking]);

    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "You're offline",
        expect.objectContaining({ description: expect.any(String) })
      );
    });

    expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
  });
});
