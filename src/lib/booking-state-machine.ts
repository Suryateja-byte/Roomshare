/**
 * P0-03 FIX: Booking State Machine
 * Provides validated state transitions for booking lifecycle.
 * Prevents invalid transitions like CANCELLED → ACCEPTED.
 */

export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/**
 * Valid state transitions for bookings.
 * Each key maps to an array of states it can transition TO.
 */
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * Check if a state transition is valid
 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  const allowedTransitions = VALID_TRANSITIONS[from];
  return allowedTransitions?.includes(to) ?? false;
}

/**
 * Validate a state transition and throw if invalid
 * @throws InvalidStateTransitionError if transition is not allowed
 */
export function validateTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/**
 * Get human-readable description of allowed transitions from a state
 */
export function getAllowedTransitions(from: BookingStatus): BookingStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}

/**
 * Check if a status is terminal (no further transitions allowed)
 */
export function isTerminalStatus(status: BookingStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

/**
 * Custom error for invalid state transitions
 */
export class InvalidStateTransitionError extends Error {
  public readonly code = 'INVALID_STATE_TRANSITION';
  public readonly statusCode = 400;
  public readonly from: BookingStatus;
  public readonly to: BookingStatus;

  constructor(from: BookingStatus, to: BookingStatus) {
    const allowedTransitions = VALID_TRANSITIONS[from];
    const allowedStr = allowedTransitions.length > 0
      ? allowedTransitions.join(', ')
      : 'none (terminal state)';

    super(
      `Invalid booking state transition: ${from} → ${to}. ` +
      `Allowed transitions from ${from}: ${allowedStr}`
    );

    this.name = 'InvalidStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * Type guard to check if an error is an InvalidStateTransitionError
 */
export function isInvalidStateTransitionError(
  error: unknown
): error is InvalidStateTransitionError {
  return error instanceof InvalidStateTransitionError;
}
