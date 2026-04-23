import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookingsClient from "@/app/bookings/BookingsClient";

jest.mock("@/components/BookingCalendar", () => ({
  __esModule: true,
  default: function MockBookingCalendar() {
    return <div data-testid="booking-calendar">Calendar View</div>;
  },
}));

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
}: {
  receivedBookings?: Booking[];
  sentBookings?: Booking[];
} = {}) {
  return render(
    <BookingsClient
      receivedBookings={receivedBookings}
      sentBookings={sentBookings}
    />
  );
}

describe("BookingsClient", () => {
  it("renders read-only history copy and omits booking-management language", () => {
    renderComponent();

    expect(screen.getByText("Your booking history.")).toBeInTheDocument();
    expect(
      screen.queryByText(/manage your booking requests and reservations/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/booking actions are disabled until you reconnect/i)
    ).not.toBeInTheDocument();
  });

  it("renders received and sent tabs and defaults to the received list", () => {
    renderComponent({
      receivedBookings: [
        createBooking({
          id: "received-1",
          listing: { ...createBooking().listing, title: "Received Listing" },
        }),
      ],
      sentBookings: [
        createBooking({
          id: "sent-1",
          listing: { ...createBooking().listing, title: "Sent Listing" },
        }),
      ],
    });

    expect(screen.getByRole("button", { name: /received/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sent/i })).toBeInTheDocument();
    expect(screen.getByText("Received Listing")).toBeInTheDocument();
    expect(screen.queryByText("Sent Listing")).not.toBeInTheDocument();
  });

  it("switches to the sent tab and keeps the surface read-only", async () => {
    const user = userEvent.setup();

    renderComponent({
      sentBookings: [
        createBooking({
          id: "sent-1",
          status: "HELD",
          heldUntil: "2026-04-01T12:00:00.000Z",
          listing: { ...createBooking().listing, title: "Sent Listing" },
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /sent/i }));

    expect(screen.getByText("Sent Listing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument();
  });

  it("keeps the default received tab read-only for pending and held records", () => {
    renderComponent({
      receivedBookings: [
        createBooking({ id: "pending-1", status: "PENDING" }),
        createBooking({
          id: "held-1",
          status: "HELD",
          heldUntil: "2026-04-01T12:00:00.000Z",
        }),
      ],
    });

    expect(
      screen.queryByRole("button", { name: /^accept$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^reject$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cancel booking/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("hold-countdown")).not.toBeInTheDocument();
  });

  it("renders booking details, status badges, and legacy booking marker", () => {
    renderComponent({
      receivedBookings: [
        createBooking({
          status: "HELD",
          listing: {
            ...createBooking().listing,
            availabilitySource: "HOST_MANAGED",
            title: "Legacy Listing",
          },
        }),
      ],
    });

    expect(screen.getByText("Legacy Listing")).toBeInTheDocument();
    expect(screen.getByText("San Francisco, CA")).toBeInTheDocument();
    expect(screen.getByText("$3200.00")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Listing has migrated to host-managed — this is a legacy booking"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Recorded on Mar 15, 2026")).toBeInTheDocument();
  });

  it("shows the legacy-booking history banner without paused-booking copy", () => {
    renderComponent({
      receivedBookings: [
        createBooking({
          listing: {
            ...createBooking().listing,
            availabilitySource: "HOST_MANAGED",
          },
        }),
      ],
    });

    expect(
      screen.getByText(
        "This page shows your booking history. To start a new conversation with a host, use Messages."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/new bookings are paused/i)
    ).not.toBeInTheDocument();
  });

  it("filters bookings by status", async () => {
    const user = userEvent.setup();

    renderComponent({
      receivedBookings: [
        createBooking({
          id: "pending-1",
          status: "PENDING",
          listing: { ...createBooking().listing, title: "Pending Listing" },
        }),
        createBooking({
          id: "accepted-1",
          status: "ACCEPTED",
          listing: { ...createBooking().listing, title: "Accepted Listing" },
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /^accepted/i }));

    expect(screen.getByText("Accepted Listing")).toBeInTheDocument();
    expect(screen.queryByText("Pending Listing")).not.toBeInTheDocument();
  });

  it("shows the read-only calendar view for received bookings", async () => {
    const user = userEvent.setup();

    renderComponent({
      receivedBookings: [createBooking({ id: "received-1" })],
    });

    await user.click(screen.getByTitle("Calendar view"));

    expect(screen.getByTestId("booking-calendar")).toBeInTheDocument();
  });

  it("uses history-first empty states with the correct CTA destinations", async () => {
    const user = userEvent.setup();

    renderComponent();

    const receivedState = screen.getByTestId("empty-state");
    const receivedLink = within(receivedState)
      .getByRole("link", { name: /list a room/i })
      .getAttribute("href");
    expect(screen.getByText("No hosted stays yet")).toBeInTheDocument();
    expect(receivedLink).toBe("/listings/create");
    expect(
      screen.queryByText(/when tenants request to book your listings/i)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sent/i }));

    const sentState = screen.getByTestId("empty-state");
    const sentLink = within(sentState)
      .getByRole("link", { name: /find a room/i })
      .getAttribute("href");
    expect(screen.getByText("No booking history yet")).toBeInTheDocument();
    expect(sentLink).toBe("/search");
    expect(
      screen.queryByText(/when you request to book a room/i)
    ).not.toBeInTheDocument();
  });
});
