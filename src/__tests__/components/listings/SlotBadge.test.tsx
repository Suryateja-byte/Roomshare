/**
 * SlotBadge component tests (CFM-603).
 *
 * Covers both the legacy (availableSlots/totalSlots) shape and the
 * normalized publicAvailability shape introduced in CFM-202/404. When the
 * publicAvailability prop is present, the badge derives its label from
 * publicStatus + freshnessBucket so callers get freshness-aware strings
 * like "Needs reconfirmation", "Full", and "Closed" without having to
 * reinvent the logic per-surface.
 */

import { render, screen } from "@testing-library/react";

import { SlotBadge } from "@/components/listings/SlotBadge";

describe("SlotBadge — legacy props path", () => {
  it("renders 'Available' when single-slot and availableSlots > 0", () => {
    render(<SlotBadge availableSlots={1} totalSlots={1} />);
    expect(screen.getByTestId("slot-badge")).toHaveTextContent("Available");
  });

  it("renders 'Filled' when all slots are taken", () => {
    render(<SlotBadge availableSlots={0} totalSlots={3} />);
    expect(screen.getByTestId("slot-badge")).toHaveTextContent("Filled");
  });

  it("renders 'X of Y open' when partially available", () => {
    render(<SlotBadge availableSlots={2} totalSlots={5} />);
    expect(screen.getByTestId("slot-badge")).toHaveTextContent("2 of 5 open");
  });

  it("renders 'All N open' when fully available with N>1", () => {
    render(<SlotBadge availableSlots={4} totalSlots={4} />);
    expect(screen.getByTestId("slot-badge")).toHaveTextContent("All 4 open");
  });
});

describe("SlotBadge — publicAvailability prop path (CFM-603)", () => {
  it("prefers publicAvailability.openSlots over legacy availableSlots", () => {
    render(
      <SlotBadge
        availableSlots={99}
        totalSlots={99}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 1,
          totalSlots: 3,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "AVAILABLE",
          freshnessBucket: "NORMAL",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent("1 of 3 open");
  });

  it("renders 'Needs reconfirmation' for stale host-managed listings (freshnessBucket=STALE)", () => {
    render(
      <SlotBadge
        availableSlots={2}
        totalSlots={3}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 2,
          totalSlots: 3,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2025-12-01T00:00:00Z",
          publicStatus: "AVAILABLE",
          freshnessBucket: "STALE",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent(
      /needs reconfirmation/i
    );
  });

  it("renders 'Needs reconfirmation' when publicStatus=NEEDS_RECONFIRMATION", () => {
    render(
      <SlotBadge
        availableSlots={2}
        totalSlots={3}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 2,
          totalSlots: 3,
          availableFrom: "2026-05-01",
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: null,
          publicStatus: "NEEDS_RECONFIRMATION",
          freshnessBucket: "AUTO_PAUSE_DUE",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent(
      /needs reconfirmation/i
    );
  });

  it("renders 'Full' when publicStatus=FULL (statusReason=NO_OPEN_SLOTS)", () => {
    render(
      <SlotBadge
        availableSlots={0}
        totalSlots={3}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 0,
          totalSlots: 3,
          availableFrom: null,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "FULL",
          freshnessBucket: "NORMAL",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent(/full/i);
  });

  it("renders 'Closed' when publicStatus=CLOSED", () => {
    render(
      <SlotBadge
        availableSlots={0}
        totalSlots={3}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 0,
          totalSlots: 3,
          availableFrom: null,
          availableUntil: "2025-12-31",
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "CLOSED",
          freshnessBucket: "NORMAL",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent(/closed/i);
  });

  it("renders 'Paused' when publicStatus=PAUSED", () => {
    render(
      <SlotBadge
        availableSlots={0}
        totalSlots={3}
        publicAvailability={{
          availabilitySource: "HOST_MANAGED",
          openSlots: 0,
          totalSlots: 3,
          availableFrom: null,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: "2026-04-01T00:00:00Z",
          publicStatus: "PAUSED",
          freshnessBucket: "NORMAL",
        }}
      />
    );
    expect(screen.getByTestId("slot-badge")).toHaveTextContent(/paused/i);
  });
});
