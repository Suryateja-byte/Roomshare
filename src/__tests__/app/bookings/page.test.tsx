import React from "react";
import { render, screen } from "@testing-library/react";
import BookingsPage from "@/app/bookings/page";
import { auth } from "@/auth";
import { getMyBookings } from "@/app/actions/manage-booking";
import { logger } from "@/lib/logger";

const mockBookingsClient = jest.fn((props: Record<string, unknown>) => (
  <div data-testid="bookings-client" data-props={JSON.stringify(props)} />
));

jest.mock("@/app/bookings/BookingsClient", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockBookingsClient(props),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/manage-booking", () => ({
  getMyBookings: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
    },
  },
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
}));

describe("BookingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: {
        id: "user-123",
      },
    });
    (getMyBookings as jest.Mock).mockResolvedValue({
      sentBookings: [],
      receivedBookings: [],
      error: null,
    });
  });

  it("always serves the history-first page contract", async () => {
    render(await BookingsPage());

    expect(mockBookingsClient).toHaveBeenCalledWith(
      expect.objectContaining({
        sentBookings: [],
        receivedBookings: [],
      })
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.booking.history_first_view_count",
      { mode: "history_first" }
    );
  });
});
