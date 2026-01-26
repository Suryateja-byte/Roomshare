/**
 * Tests for booking state machine
 * P0-03 FIX: Validates state transition logic to prevent invalid transitions
 */

import {
  canTransition,
  validateTransition,
  getAllowedTransitions,
  isTerminalStatus,
  InvalidStateTransitionError,
  isInvalidStateTransitionError,
  VALID_TRANSITIONS,
  type BookingStatus,
} from '@/lib/booking-state-machine';

describe('booking-state-machine', () => {
  describe('VALID_TRANSITIONS', () => {
    it('defines transitions for all booking statuses', () => {
      const allStatuses: BookingStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'];
      allStatuses.forEach(status => {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
      });
    });

    it('PENDING can transition to ACCEPTED, REJECTED, or CANCELLED', () => {
      expect(VALID_TRANSITIONS.PENDING).toEqual(['ACCEPTED', 'REJECTED', 'CANCELLED']);
    });

    it('ACCEPTED can only transition to CANCELLED', () => {
      expect(VALID_TRANSITIONS.ACCEPTED).toEqual(['CANCELLED']);
    });

    it('REJECTED is a terminal state', () => {
      expect(VALID_TRANSITIONS.REJECTED).toEqual([]);
    });

    it('CANCELLED is a terminal state', () => {
      expect(VALID_TRANSITIONS.CANCELLED).toEqual([]);
    });
  });

  describe('canTransition', () => {
    // Valid transitions from PENDING
    it('allows PENDING -> ACCEPTED', () => {
      expect(canTransition('PENDING', 'ACCEPTED')).toBe(true);
    });

    it('allows PENDING -> REJECTED', () => {
      expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    });

    it('allows PENDING -> CANCELLED', () => {
      expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    // Valid transitions from ACCEPTED
    it('allows ACCEPTED -> CANCELLED', () => {
      expect(canTransition('ACCEPTED', 'CANCELLED')).toBe(true);
    });

    // Invalid transitions
    it('rejects PENDING -> PENDING (no-op)', () => {
      expect(canTransition('PENDING', 'PENDING')).toBe(false);
    });

    it('rejects ACCEPTED -> PENDING', () => {
      expect(canTransition('ACCEPTED', 'PENDING')).toBe(false);
    });

    it('rejects ACCEPTED -> ACCEPTED (no-op)', () => {
      expect(canTransition('ACCEPTED', 'ACCEPTED')).toBe(false);
    });

    it('rejects ACCEPTED -> REJECTED', () => {
      expect(canTransition('ACCEPTED', 'REJECTED')).toBe(false);
    });

    // Invalid transitions from terminal states
    it('rejects REJECTED -> PENDING', () => {
      expect(canTransition('REJECTED', 'PENDING')).toBe(false);
    });

    it('rejects REJECTED -> ACCEPTED (P0-03 critical case)', () => {
      expect(canTransition('REJECTED', 'ACCEPTED')).toBe(false);
    });

    it('rejects REJECTED -> CANCELLED', () => {
      expect(canTransition('REJECTED', 'CANCELLED')).toBe(false);
    });

    it('rejects CANCELLED -> PENDING', () => {
      expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
    });

    it('rejects CANCELLED -> ACCEPTED (P0-03 critical case)', () => {
      expect(canTransition('CANCELLED', 'ACCEPTED')).toBe(false);
    });

    it('rejects CANCELLED -> REJECTED', () => {
      expect(canTransition('CANCELLED', 'REJECTED')).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('does not throw for valid transitions', () => {
      expect(() => validateTransition('PENDING', 'ACCEPTED')).not.toThrow();
      expect(() => validateTransition('PENDING', 'REJECTED')).not.toThrow();
      expect(() => validateTransition('PENDING', 'CANCELLED')).not.toThrow();
      expect(() => validateTransition('ACCEPTED', 'CANCELLED')).not.toThrow();
    });

    it('throws InvalidStateTransitionError for invalid transitions', () => {
      expect(() => validateTransition('CANCELLED', 'ACCEPTED'))
        .toThrow(InvalidStateTransitionError);
    });

    it('error contains from and to states', () => {
      try {
        validateTransition('REJECTED', 'ACCEPTED');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidStateTransitionError);
        if (error instanceof InvalidStateTransitionError) {
          expect(error.from).toBe('REJECTED');
          expect(error.to).toBe('ACCEPTED');
          expect(error.code).toBe('INVALID_STATE_TRANSITION');
          expect(error.statusCode).toBe(400);
        }
      }
    });

    it('error message includes transition details', () => {
      try {
        validateTransition('CANCELLED', 'PENDING');
        fail('Expected error to be thrown');
      } catch (error) {
        if (error instanceof InvalidStateTransitionError) {
          expect(error.message).toContain('CANCELLED');
          expect(error.message).toContain('PENDING');
          expect(error.message).toContain('terminal state');
        }
      }
    });
  });

  describe('getAllowedTransitions', () => {
    it('returns correct transitions for PENDING', () => {
      expect(getAllowedTransitions('PENDING')).toEqual(['ACCEPTED', 'REJECTED', 'CANCELLED']);
    });

    it('returns correct transitions for ACCEPTED', () => {
      expect(getAllowedTransitions('ACCEPTED')).toEqual(['CANCELLED']);
    });

    it('returns empty array for REJECTED', () => {
      expect(getAllowedTransitions('REJECTED')).toEqual([]);
    });

    it('returns empty array for CANCELLED', () => {
      expect(getAllowedTransitions('CANCELLED')).toEqual([]);
    });
  });

  describe('isTerminalStatus', () => {
    it('PENDING is not terminal', () => {
      expect(isTerminalStatus('PENDING')).toBe(false);
    });

    it('ACCEPTED is not terminal', () => {
      expect(isTerminalStatus('ACCEPTED')).toBe(false);
    });

    it('REJECTED is terminal', () => {
      expect(isTerminalStatus('REJECTED')).toBe(true);
    });

    it('CANCELLED is terminal', () => {
      expect(isTerminalStatus('CANCELLED')).toBe(true);
    });
  });

  describe('isInvalidStateTransitionError', () => {
    it('returns true for InvalidStateTransitionError instances', () => {
      const error = new InvalidStateTransitionError('CANCELLED', 'ACCEPTED');
      expect(isInvalidStateTransitionError(error)).toBe(true);
    });

    it('returns false for regular Error', () => {
      const error = new Error('Some error');
      expect(isInvalidStateTransitionError(error)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isInvalidStateTransitionError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isInvalidStateTransitionError(undefined)).toBe(false);
    });

    it('returns false for string', () => {
      expect(isInvalidStateTransitionError('error')).toBe(false);
    });
  });

  describe('InvalidStateTransitionError', () => {
    it('has correct name property', () => {
      const error = new InvalidStateTransitionError('PENDING', 'PENDING');
      expect(error.name).toBe('InvalidStateTransitionError');
    });

    it('includes allowed transitions in message for non-terminal states', () => {
      const error = new InvalidStateTransitionError('PENDING', 'PENDING');
      expect(error.message).toContain('ACCEPTED, REJECTED, CANCELLED');
    });

    it('indicates terminal state in message when no transitions allowed', () => {
      const error = new InvalidStateTransitionError('CANCELLED', 'ACCEPTED');
      expect(error.message).toContain('terminal state');
    });
  });
});
