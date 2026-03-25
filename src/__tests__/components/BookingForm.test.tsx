/**
 * Tests for BookingForm component
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import BookingForm from "@/components/BookingForm";

// Mock createPortal to render inline (needed for confirmation modal)
jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock dependencies
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockIsOffline = { isOffline: false };
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => mockIsOffline,
}));

jest.mock("@/app/actions/booking", () => ({
  createBooking: jest.fn(),
  createHold: jest.fn(),
}));

// Mock DatePicker as a simple input so we can set dates via fireEvent.change
jest.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({
    value,
    onChange,
    placeholder,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    id?: string;
    minDate?: string;
    className?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => (
    <input
      data-testid={`date-picker-${id}`}
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

// Mock FocusTrap to just render children (needed for confirmation modal)
jest.mock("@/components/ui/FocusTrap", () => ({
  FocusTrap: ({
    children,
  }: {
    children: React.ReactNode;
    active?: boolean;
  }) => <div data-testid="focus-trap">{children}</div>,
}));

import { createBooking, createHold } from "@/app/actions/booking";

describe("BookingForm", () => {
  const defaultProps = {
    listingId: "listing-123",
    price: 1500,
    ownerId: "owner-456",
    isOwner: false,
    isLoggedIn: true,
    status: "ACTIVE" as const,
    bookedDates: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOffline.isOffline = false;
    sessionStorage.clear();
    (createBooking as jest.Mock).mockResolvedValue({ success: true });
  });

  describe("rendering", () => {
    it("displays price amount", () => {
      render(<BookingForm {...defaultProps} />);

      // Price appears multiple times (header and breakdown), so use getAllByText
      expect(screen.getAllByText("$1500").length).toBeGreaterThan(0);
    });

    it("shows Available now status for ACTIVE listing", () => {
      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText("Available now")).toBeInTheDocument();
    });

    it("shows Temporarily unavailable status for PAUSED listing", () => {
      render(<BookingForm {...defaultProps} status="PAUSED" />);

      expect(screen.getByText("Temporarily unavailable")).toBeInTheDocument();
    });

    it("shows Currently rented status for RENTED listing", () => {
      render(<BookingForm {...defaultProps} status="RENTED" />);

      expect(screen.getByText("Currently rented")).toBeInTheDocument();
    });

    it("returns null for owner view", () => {
      const { container } = render(
        <BookingForm {...defaultProps} isOwner={true} />
      );

      expect(container.firstChild).toBeNull();
    });

    it("shows login gate for non-logged-in users", () => {
      render(<BookingForm {...defaultProps} isLoggedIn={false} />);

      expect(screen.getByText("Sign in to book this room")).toBeInTheDocument();
    });

    it("hides booking form and price breakdown for non-logged-in users", () => {
      render(<BookingForm {...defaultProps} isLoggedIn={false} />);
      // Login gate should be visible
      expect(screen.getByText("Sign in to book this room")).toBeInTheDocument();
      // Form elements should NOT be in the DOM
      expect(screen.queryByText("Check-in")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /request to book/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Price breakdown")).not.toBeInTheDocument();
    });

    it("shows minimum stay requirement", () => {
      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText("30 day minimum")).toBeInTheDocument();
    });

    it("displays booked dates when provided", () => {
      const bookedDates = [{ startDate: "2025-01-15", endDate: "2025-02-15" }];
      render(<BookingForm {...defaultProps} bookedDates={bookedDates} />);

      expect(screen.getByText("Booked Periods")).toBeInTheDocument();
    });
  });

  describe("date validation", () => {
    it("shows error for missing dates on submit", () => {
      render(<BookingForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /request to book/i,
      });
      fireEvent.click(submitButton);

      expect(
        screen.getByText(/please select both check-in and check-out dates/i)
      ).toBeInTheDocument();
    });
  });

  describe("network status", () => {
    it("shows offline banner when offline", () => {
      mockIsOffline.isOffline = true;
      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    });

    it("disables submit button when offline", () => {
      mockIsOffline.isOffline = true;
      render(<BookingForm {...defaultProps} />);

      const submitButton = screen.getByRole("button", {
        name: /request to book/i,
      });
      expect(submitButton).toBeDisabled();
    });
  });

  describe("form elements", () => {
    it("shows date labels", () => {
      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText("Check-in")).toBeInTheDocument();
      expect(screen.getByText("Check-out")).toBeInTheDocument();
    });

    it("shows request to book button", () => {
      render(<BookingForm {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /request to book/i })
      ).toBeInTheDocument();
    });

    it("shows disclaimer text", () => {
      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText("You won't be charged yet")).toBeInTheDocument();
    });
  });

  describe("status handling", () => {
    it("shows unavailable message for PAUSED status", () => {
      render(<BookingForm {...defaultProps} status="PAUSED" />);

      // Multiple elements may have this text (header and body)
      expect(
        screen.getAllByText(/temporarily unavailable/i).length
      ).toBeGreaterThan(0);
    });

    it("shows rented message for RENTED status", () => {
      render(<BookingForm {...defaultProps} status="RENTED" />);

      // Multiple elements may have this text (header and body)
      expect(screen.getAllByText(/currently rented/i).length).toBeGreaterThan(
        0
      );
    });
  });

  describe("idempotency", () => {
    it("checks session storage for pending submission", () => {
      render(<BookingForm {...defaultProps} />);

      // The component should generate a key
      expect(
        sessionStorage.getItem(`booking_submitted_${defaultProps.listingId}`)
      ).toBeNull();
    });

    it("shows already submitted message when session storage has submission", () => {
      sessionStorage.setItem(
        `booking_submitted_${defaultProps.listingId}`,
        "true"
      );

      render(<BookingForm {...defaultProps} />);

      expect(screen.getByText(/already submitted/i)).toBeInTheDocument();
    });
  });

  describe("SlotSelector visibility", () => {
    it("shows SlotSelector when totalSlots > 1 and bookingMode is not WHOLE_UNIT", () => {
      render(
        <BookingForm
          {...defaultProps}
          totalSlots={4}
          availableSlots={3}
          bookingMode="SHARED"
        />
      );

      expect(screen.getByLabelText("Decrease slots")).toBeInTheDocument();
      expect(screen.getByLabelText("Increase slots")).toBeInTheDocument();
    });

    it("hides SlotSelector when totalSlots is 1", () => {
      render(
        <BookingForm
          {...defaultProps}
          totalSlots={1}
          availableSlots={1}
          bookingMode="SHARED"
        />
      );

      expect(screen.queryByLabelText("Decrease slots")).not.toBeInTheDocument();
    });

    it("hides SlotSelector when bookingMode is WHOLE_UNIT", () => {
      render(
        <BookingForm
          {...defaultProps}
          totalSlots={4}
          availableSlots={3}
          bookingMode="WHOLE_UNIT"
        />
      );

      expect(screen.queryByLabelText("Decrease slots")).not.toBeInTheDocument();
    });
  });

  describe("hold TTL display", () => {
    it("shows dynamic TTL in hold button text", () => {
      render(
        <BookingForm {...defaultProps} holdEnabled={true} holdTtlMinutes={30} />
      );

      expect(screen.getByText(/Place Hold \(30 min\)/)).toBeInTheDocument();
    });

    it("defaults to 15 min when holdTtlMinutes not provided", () => {
      render(<BookingForm {...defaultProps} holdEnabled={true} />);

      expect(screen.getByText(/Place Hold \(15 min\)/)).toBeInTheDocument();
    });
  });

  describe("submission flow", () => {
    // Helper: compute future dates that satisfy the 30-day minimum
    const futureStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    })();
    const futureEnd = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 45); // 38 days from start, well over 30-day minimum
      return d.toISOString().split("T")[0];
    })();

    /** Set both date inputs and click "Request to Book" to open the confirm modal */
    async function fillDatesAndSubmit() {
      const startInput = screen.getByTestId("date-picker-booking-start-date");
      const endInput = screen.getByTestId("date-picker-booking-end-date");

      await act(async () => {
        fireEvent.change(startInput, { target: { value: futureStart } });
      });
      await act(async () => {
        fireEvent.change(endInput, { target: { value: futureEnd } });
      });

      const submitButton = screen.getByRole("button", {
        name: /request to book/i,
      });
      await act(async () => {
        fireEvent.click(submitButton);
      });
    }

    it("happy path: calls createBooking with correct args on confirm", async () => {
      (createBooking as jest.Mock).mockResolvedValue({
        success: true,
        bookingId: "booking-abc",
      });

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      // Confirmation modal should appear
      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      expect(confirmButton).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(createBooking).toHaveBeenCalledTimes(1);
      });

      // Verify args: listingId, startDate (Date), endDate (Date), price, slots, idempotencyKey
      const callArgs = (createBooking as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe("listing-123");
      expect(callArgs[1]).toBeInstanceOf(Date);
      expect(callArgs[2]).toBeInstanceOf(Date);
      expect(callArgs[3]).toBe(1500);

      // Success message should appear
      await waitFor(() => {
        expect(screen.getByText(/request sent successfully/i)).toBeInTheDocument();
      });
    });

    it("shows capacity error when not enough slots available", async () => {
      (createBooking as jest.Mock).mockResolvedValue({
        success: false,
        error: "Not enough available slots. 0 of 1 slots available.",
      });

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/not enough available slots/i)
        ).toBeInTheDocument();
      });
    });

    it("shows price changed message when price has changed", async () => {
      (createBooking as jest.Mock).mockResolvedValue({
        success: false,
        code: "PRICE_CHANGED",
        currentPrice: 1200,
        error: "Price has changed",
      });

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/listing price has changed to \$1200\/month/i)
        ).toBeInTheDocument();
      });
    });

    it("shows auth error when session expired", async () => {
      (createBooking as jest.Mock).mockResolvedValue({
        success: false,
        code: "SESSION_EXPIRED",
        error: "You must be logged in",
      });

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/session has expired/i)
        ).toBeInTheDocument();
      });
    });

    it("shows generic error on network/thrown error", async () => {
      (createBooking as jest.Mock).mockRejectedValue(
        new Error("Network failure")
      );

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/unexpected error occurred/i)
        ).toBeInTheDocument();
      });
    });

    it("shows rate limit message when rate limited", async () => {
      (createBooking as jest.Mock).mockResolvedValue({
        success: false,
        error: "Too many requests. Rate limit exceeded.",
      });

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/too many booking requests/i)
        ).toBeInTheDocument();
      });
    });

    it("hold happy path: calls createHold when hold button clicked", async () => {
      (createHold as jest.Mock).mockResolvedValue({
        success: true,
        bookingId: "hold-abc",
        heldUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        holdTtlMinutes: 15,
      });

      render(<BookingForm {...defaultProps} holdEnabled={true} />);

      const startInput = screen.getByTestId("date-picker-booking-start-date");
      const endInput = screen.getByTestId("date-picker-booking-end-date");

      await act(async () => {
        fireEvent.change(startInput, { target: { value: futureStart } });
      });
      await act(async () => {
        fireEvent.change(endInput, { target: { value: futureEnd } });
      });

      const holdButton = screen.getByRole("button", {
        name: /place hold/i,
      });
      await act(async () => {
        fireEvent.click(holdButton);
      });

      await waitFor(() => {
        expect(createHold).toHaveBeenCalledTimes(1);
      });

      const callArgs = (createHold as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe("listing-123");
      expect(callArgs[1]).toBeInstanceOf(Date);
      expect(callArgs[2]).toBeInstanceOf(Date);
      expect(callArgs[3]).toBe(1500);

      await waitFor(() => {
        expect(
          screen.getByText(/hold placed successfully/i)
        ).toBeInTheDocument();
      });
    });

    it("debounce: double-click confirm does not double-submit", async () => {
      let resolveBooking: (value: { success: boolean; bookingId: string }) => void;
      (createBooking as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveBooking = resolve;
          })
      );

      render(<BookingForm {...defaultProps} />);
      await fillDatesAndSubmit();

      const confirmButton = screen.getByRole("button", {
        name: /confirm booking/i,
      });

      // Click confirm twice rapidly
      await act(async () => {
        fireEvent.click(confirmButton);
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      // Resolve the pending promise
      await act(async () => {
        resolveBooking!({ success: true, bookingId: "booking-abc" });
      });

      await waitFor(() => {
        // Should only have been called once due to debounce protection
        expect(createBooking).toHaveBeenCalledTimes(1);
      });
    });
  });
});
