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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingsClient from "@/app/bookings/BookingsClient";

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
    availabilitySource?: "LEGACY_BOOKING" | "HOST_MANAGED";
    location: { city: string; state: string } | null;
    owner?: { id: string; name: string | null; image: string | null };
  };
  tenant?: { id: string; name: string | null; image: string | null };
};

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
      availabilitySource: "LEGACY_BOOKING",
      location: { city: "San Francisco", state: "CA" },
      owner: { id: "owner-1", name: "Host User", image: null },
    },
    tenant: { id: "tenant-1", name: "Tenant User", image: null },
    ...overrides,
  };
}

function renderComponent({
  receivedBookings = [],
  sentBookings = [],
  isHistoryFirstMode = false,
}: {
  receivedBookings?: Booking[];
  sentBookings?: Booking[];
  isHistoryFirstMode?: boolean;
} = {}) {
  return render(
    <BookingsClient
      receivedBookings={receivedBookings}
      sentBookings={sentBookings}
      isHistoryFirstMode={isHistoryFirstMode}
    />
  );
}

describe("BookingsClient history-first mode", () => {
  it("hides Accept and Reject for a pending received booking when enabled", () => {
    renderComponent({
      receivedBookings: [createBooking({ status: "PENDING" })],
      isHistoryFirstMode: true,
    });

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("hides Cancel Booking for a pending sent booking when enabled", async () => {
    const user = userEvent.setup();

    renderComponent({
      sentBookings: [createBooking({ status: "PENDING" })],
      isHistoryFirstMode: true,
    });

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("hides Accept and Reject for a held received booking when enabled", () => {
    renderComponent({
      receivedBookings: [
        createBooking({
          status: "HELD",
          heldUntil: "2026-04-01T00:00:00.000Z",
        }),
      ],
      isHistoryFirstMode: true,
    });

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
  });

  it("hides Cancel Booking for an accepted sent booking when enabled", async () => {
    const user = userEvent.setup();

    renderComponent({
      sentBookings: [createBooking({ status: "ACCEPTED" })],
      isHistoryFirstMode: true,
    });

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
  });

  it("shows the read-only subhead when enabled", () => {
    renderComponent({ isHistoryFirstMode: true });

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("shows the history-first legacy banner copy when enabled", () => {
    renderComponent({
      receivedBookings: [
        createBooking({
          listing: {
            ...createBooking().listing,
            availabilitySource: "HOST_MANAGED",
          },
        }),
      ],
      isHistoryFirstMode: true,
    });

    expect(
      screen.getByText(
        "This is your booking history. To start a new conversation with a host, use Messages."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/New bookings are paused\./i)
    ).not.toBeInTheDocument();
  });

  it("keeps Accept and Reject visible for a pending received booking when disabled", () => {
    renderComponent({
      receivedBookings: [createBooking({ status: "PENDING" })],
      isHistoryFirstMode: false,
    });

    expect(
      screen.getByRole("button", { name: /^accept$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^reject$/i })
    ).toBeInTheDocument();
  });

  it("keeps Cancel Booking visible for a pending sent booking when disabled", async () => {
    const user = userEvent.setup();

    renderComponent({
      sentBookings: [createBooking({ status: "PENDING" })],
      isHistoryFirstMode: false,
    });

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(
      screen.getByRole("button", { name: /cancel booking/i })
    ).toBeInTheDocument();
  });
});
