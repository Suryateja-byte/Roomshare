/**
 * Tests for BookingCalendar component.
 *
 * Covers: calendar grid rendering, booking indicators by status,
 * date selection and booking detail panel, month navigation,
 * empty state, loading overlay, and onBookingClick callback.
 */

// Mock lucide-react icons — simple SVG stubs
jest.mock('lucide-react', () => ({
  ChevronLeft: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-left" className={className} />
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-right" className={className} />
  ),
  Clock: ({ className }: { className?: string }) => (
    <svg data-testid="clock-icon" className={className} />
  ),
  User: ({ className }: { className?: string }) => (
    <svg data-testid="user-icon" className={className} />
  ),
  Home: ({ className }: { className?: string }) => (
    <svg data-testid="home-icon" className={className} />
  ),
  Loader2: ({ className }: { className?: string }) => (
    <svg data-testid="loader-icon" className={className} />
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import BookingCalendar from '@/components/BookingCalendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a booking fixture with sensible defaults. */
function makeBooking(
  overrides: Partial<{
    id: string;
    startDate: string;
    endDate: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'HELD' | 'EXPIRED';
    tenantName: string | null;
    listingTitle: string;
  }> = {}
) {
  return {
    id: overrides.id ?? 'booking-1',
    startDate: overrides.startDate ?? '2025-06-10',
    endDate: overrides.endDate ?? '2025-06-10',
    status: overrides.status ?? ('PENDING' as const),
    tenant: {
      id: 'tenant-1',
      name: overrides.tenantName !== undefined ? overrides.tenantName : 'Alice Tenant',
      image: null,
    },
    listing: {
      id: 'listing-1',
      title: overrides.listingTitle ?? 'Cozy Room',
    },
  };
}

/**
 * Return all indicator dots (w-1.5 h-1.5 rounded-full) that live INSIDE a
 * calendar day button (i.e. not the legend dots which are outside buttons).
 */
function getDayIndicators(container: HTMLElement, colorClass: string) {
  // Day buttons have aspect-square p-1 rounded-lg relative — we look for
  // indicator spans inside them.
  const dayButtons = container.querySelectorAll<HTMLButtonElement>('button.aspect-square');
  const dots: Element[] = [];
  dayButtons.forEach((btn) => {
    btn.querySelectorAll(`.${colorClass}`).forEach((dot) => dots.push(dot));
  });
  return dots;
}

// ---------------------------------------------------------------------------
// Pin the component's initial date so tests are deterministic.
// BookingCalendar calls `new Date()` inside useState — we freeze time to a
// known month (June 2025) so all calendar-grid assertions are stable.
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date(2025, 5, 15); // June 15, 2025 (month index 5)

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookingCalendar', () => {
  describe('calendar grid rendering', () => {
    it('shows the current month and year in the header', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.getByText('June 2025')).toBeInTheDocument();
    });

    it('renders all 7 day-of-week headers', () => {
      render(<BookingCalendar bookings={[]} />);

      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((day) => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('renders day numbers for the current month', () => {
      render(<BookingCalendar bookings={[]} />);

      // June has 30 days — day 1 and day 30 should both be present
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '30' })).toBeInTheDocument();
    });

    it('does not render a day 31 for June', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.queryByRole('button', { name: '31' })).not.toBeInTheDocument();
    });

    it('includes a Today button', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    });

    it('includes Previous month and Next month navigation buttons', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    });

    it('shows legend items for Pending and Accepted', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });
  });

  describe('empty state — no date selected', () => {
    it('shows prompt to select a date when nothing is selected', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.getByText('Select a date to view bookings')).toBeInTheDocument();
    });
  });

  describe('booking indicators', () => {
    it('renders amber indicator dot inside the day button for a PENDING booking', () => {
      const booking = makeBooking({ status: 'PENDING', startDate: '2025-06-10', endDate: '2025-06-10' });
      const { container } = render(<BookingCalendar bookings={[booking]} />);

      // Indicator lives inside a day button (aspect-square), not in the legend
      expect(getDayIndicators(container, 'bg-amber-400').length).toBeGreaterThan(0);
    });

    it('renders green indicator dot inside the day button for an ACCEPTED booking', () => {
      const booking = makeBooking({ status: 'ACCEPTED', startDate: '2025-06-10', endDate: '2025-06-10' });
      const { container } = render(<BookingCalendar bookings={[booking]} />);

      expect(getDayIndicators(container, 'bg-green-500').length).toBeGreaterThan(0);
    });

    it('renders both indicators when a date has PENDING and ACCEPTED bookings', () => {
      const pending = makeBooking({ id: 'b1', status: 'PENDING', startDate: '2025-06-10', endDate: '2025-06-10' });
      const accepted = makeBooking({ id: 'b2', status: 'ACCEPTED', startDate: '2025-06-10', endDate: '2025-06-10' });
      const { container } = render(<BookingCalendar bookings={[pending, accepted]} />);

      expect(getDayIndicators(container, 'bg-amber-400').length).toBeGreaterThan(0);
      expect(getDayIndicators(container, 'bg-green-500').length).toBeGreaterThan(0);
    });

    it('does not render booking indicator dots inside day buttons when there are no bookings', () => {
      const { container } = render(<BookingCalendar bookings={[]} />);

      expect(getDayIndicators(container, 'bg-amber-400').length).toBe(0);
      expect(getDayIndicators(container, 'bg-green-500').length).toBe(0);
    });

    it('shows indicator for a booking whose range spans the given date', () => {
      // Booking starts June 5 and ends June 20 — every day in that range should show a dot
      const booking = makeBooking({ status: 'ACCEPTED', startDate: '2025-06-05', endDate: '2025-06-20' });
      const { container } = render(<BookingCalendar bookings={[booking]} />);

      expect(getDayIndicators(container, 'bg-green-500').length).toBeGreaterThan(0);
    });
  });

  describe('date selection', () => {
    it('shows booking details after clicking a date with bookings', () => {
      const booking = makeBooking({
        status: 'PENDING',
        startDate: '2025-06-10',
        endDate: '2025-06-10',
        tenantName: 'Bob Renter',
        listingTitle: 'Garden Flat',
      });
      render(<BookingCalendar bookings={[booking]} />);

      fireEvent.click(screen.getByRole('button', { name: '10' }));

      expect(screen.getByText('Bob Renter')).toBeInTheDocument();
      expect(screen.getByText('Garden Flat')).toBeInTheDocument();
    });

    it('shows "No bookings on this day" after clicking a date with no bookings', () => {
      const booking = makeBooking({ startDate: '2025-06-10', endDate: '2025-06-10' });
      render(<BookingCalendar bookings={[booking]} />);

      // Day 5 has no booking
      fireEvent.click(screen.getByRole('button', { name: '5' }));

      expect(screen.getByText('No bookings on this day')).toBeInTheDocument();
    });

    it('shows tenant name as "Guest" when tenant name is null', () => {
      const booking = makeBooking({ status: 'PENDING', startDate: '2025-06-12', endDate: '2025-06-12', tenantName: null });
      render(<BookingCalendar bookings={[booking]} />);

      fireEvent.click(screen.getByRole('button', { name: '12' }));

      expect(screen.getByText('Guest')).toBeInTheDocument();
    });

    it('shows the selected date in the detail panel heading', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: '15' }));

      // The detail panel heading shows a formatted date that includes "June 15"
      expect(screen.getByText(/June 15/)).toBeInTheDocument();
    });

    it('calls onBookingClick with the booking when a booking card is clicked', () => {
      const onBookingClick = jest.fn();
      const booking = makeBooking({ id: 'bk-42', status: 'ACCEPTED', startDate: '2025-06-10', endDate: '2025-06-10' });
      render(<BookingCalendar bookings={[booking]} onBookingClick={onBookingClick} />);

      // Select the date to reveal the detail panel
      fireEvent.click(screen.getByRole('button', { name: '10' }));

      // Click the booking card (a button) that contains the tenant name
      const cardButton = screen.getByText('Alice Tenant').closest('button') as HTMLElement;
      fireEvent.click(cardButton);

      expect(onBookingClick).toHaveBeenCalledTimes(1);
      expect(onBookingClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'bk-42' }));
    });

    it('shows multiple bookings on the same date in the detail panel', () => {
      const b1 = makeBooking({ id: 'b1', status: 'PENDING', startDate: '2025-06-20', endDate: '2025-06-20', tenantName: 'Tenant One', listingTitle: 'Room A' });
      const b2 = makeBooking({ id: 'b2', status: 'ACCEPTED', startDate: '2025-06-20', endDate: '2025-06-20', tenantName: 'Tenant Two', listingTitle: 'Room B' });
      render(<BookingCalendar bookings={[b1, b2]} />);

      fireEvent.click(screen.getByRole('button', { name: '20' }));

      expect(screen.getByText('Tenant One')).toBeInTheDocument();
      expect(screen.getByText('Tenant Two')).toBeInTheDocument();
    });
  });

  describe('month navigation', () => {
    it('navigates to the previous month when Previous month is clicked', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

      expect(screen.getByText('May 2025')).toBeInTheDocument();
    });

    it('navigates to the next month when Next month is clicked', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

      expect(screen.getByText('July 2025')).toBeInTheDocument();
    });

    it('navigates back to current month when Today is clicked after navigating away', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
      expect(screen.getByText('July 2025')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Today' }));
      expect(screen.getByText('June 2025')).toBeInTheDocument();
    });

    it('renders correct day count for the navigated month (July has 31 days)', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

      expect(screen.getByRole('button', { name: '31' })).toBeInTheDocument();
    });

    it('renders correct day count for the navigated month (May has 31 days)', () => {
      render(<BookingCalendar bookings={[]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

      expect(screen.getByRole('button', { name: '31' })).toBeInTheDocument();
    });

    it('does not show June booking indicators after navigating to July', () => {
      const booking = makeBooking({ status: 'PENDING', startDate: '2025-06-10', endDate: '2025-06-10' });
      const { container } = render(<BookingCalendar bookings={[booking]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

      // No PENDING indicators inside day buttons in July (no bookings in July)
      expect(getDayIndicators(container, 'bg-amber-400').length).toBe(0);
    });
  });

  describe('loading state', () => {
    it('shows loading overlay when isLoading is true', () => {
      render(<BookingCalendar bookings={[]} isLoading />);

      expect(screen.getByRole('status', { name: /loading bookings/i })).toBeInTheDocument();
      expect(screen.getByText('Loading bookings...')).toBeInTheDocument();
    });

    it('does not show loading overlay when isLoading is false', () => {
      render(<BookingCalendar bookings={[]} isLoading={false} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not show loading overlay by default', () => {
      render(<BookingCalendar bookings={[]} />);

      expect(screen.queryByText('Loading bookings...')).not.toBeInTheDocument();
    });
  });
});
