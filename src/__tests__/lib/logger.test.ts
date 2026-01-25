/**
 * Tests for logger.ts PII redaction
 *
 * P1-14: Ensure no raw PII appears in logs
 * - Email addresses are redacted
 * - Phone numbers are redacted
 * - Addresses are redacted
 * - Sensitive field names are redacted
 */

import { redactSensitive } from '@/lib/logger';

describe('Logger PII Redaction', () => {
  describe('redactSensitive', () => {
    describe('Email redaction', () => {
      it('redacts email addresses in strings', () => {
        const input = 'Contact user at john.doe@example.com for details';
        const result = redactSensitive(input);
        expect(result).toBe('Contact user at [REDACTED] for details');
        expect(result).not.toContain('john.doe@example.com');
      });

      it('redacts multiple email addresses', () => {
        const input = 'From: sender@test.com To: receiver@test.org';
        const result = redactSensitive(input) as string;
        expect(result).not.toContain('sender@test.com');
        expect(result).not.toContain('receiver@test.org');
        expect(result).toBe('From: [REDACTED] To: [REDACTED]');
      });

      it('redacts email addresses in object values', () => {
        const input = {
          user: 'john',
          contact: 'john@example.com',
        };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.contact).toBe('[REDACTED]');
      });
    });

    describe('Phone number redaction', () => {
      it('redacts US phone numbers with dashes', () => {
        const input = 'Call me at 555-123-4567';
        const result = redactSensitive(input);
        expect(result).toBe('Call me at [REDACTED_PHONE]');
      });

      it('redacts US phone numbers with dots', () => {
        const input = 'Phone: 555.123.4567';
        const result = redactSensitive(input);
        expect(result).toBe('Phone: [REDACTED_PHONE]');
      });

      it('redacts US phone numbers with parentheses', () => {
        const input = 'Call (555) 123-4567 today';
        const result = redactSensitive(input);
        expect(result).toBe('Call [REDACTED_PHONE] today');
      });

      it('redacts international phone numbers', () => {
        const input = 'International: +1-555-123-4567';
        const result = redactSensitive(input);
        expect(result).toBe('International: [REDACTED_PHONE]');
      });

      it('redacts phone numbers in object values', () => {
        const input = { phone: '555-123-4567' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.phone).toBe('[REDACTED_PHONE]');
      });
    });

    describe('Address redaction', () => {
      it('redacts street addresses', () => {
        const input = 'Located at 123 Main Street, Apt 4B';
        const result = redactSensitive(input);
        expect(result).toBe('Located at [REDACTED_ADDRESS]');
      });

      it('redacts addresses with common suffixes', () => {
        const addresses = [
          '456 Oak Ave',
          '789 Pine Blvd',
          '101 Cedar Dr',
          '202 Elm Lane',
          '303 Maple Court',
        ];
        for (const addr of addresses) {
          const result = redactSensitive(addr);
          expect(result).toBe('[REDACTED_ADDRESS]');
        }
      });
    });

    describe('Sensitive field name redaction', () => {
      it('redacts password fields', () => {
        const input = { password: 'secret123' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.password).toBe('[REDACTED]');
      });

      it('redacts token fields', () => {
        const input = { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.accessToken).toBe('[REDACTED]');
      });

      it('redacts API key fields', () => {
        const input = { apiKey: 'sk_live_abc123', api_key: 'pk_test_xyz789' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.apiKey).toBe('[REDACTED]');
        expect(result.api_key).toBe('[REDACTED]');
      });

      it('redacts credit card fields', () => {
        const input = { creditCard: '4111111111111111', cvv: '123' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.creditCard).toBe('[REDACTED]');
        expect(result.cvv).toBe('[REDACTED]');
      });

      it('redacts SSN fields', () => {
        const input = { ssn: '123-45-6789' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.ssn).toBe('[REDACTED]');
      });

      it('handles case-insensitive field matching', () => {
        const input = { PASSWORD: 'secret', Token: 'abc', APIKEY: '123' };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.PASSWORD).toBe('[REDACTED]');
        expect(result.Token).toBe('[REDACTED]');
        expect(result.APIKEY).toBe('[REDACTED]');
      });
    });

    describe('JWT token redaction', () => {
      it('redacts JWT tokens in strings', () => {
        const jwt = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const input = `Authorization: ${jwt}`;
        const result = redactSensitive(input);
        expect(result).not.toContain('eyJ');
        expect(result).toContain('[REDACTED]');
      });
    });

    describe('Nested object handling', () => {
      it('redacts nested objects', () => {
        const input = {
          user: {
            email: 'test@example.com',
            profile: {
              password: 'secret',
            },
          },
        };
        const result = redactSensitive(input) as Record<string, unknown>;
        const user = result.user as Record<string, unknown>;
        expect(user.email).toBe('[REDACTED]');
        const profile = user.profile as Record<string, unknown>;
        expect(profile.password).toBe('[REDACTED]');
      });

      it('redacts arrays of objects', () => {
        const input = [
          { email: 'a@example.com' },
          { email: 'b@example.com' },
        ];
        const result = redactSensitive(input) as Array<Record<string, unknown>>;
        expect(result[0].email).toBe('[REDACTED]');
        expect(result[1].email).toBe('[REDACTED]');
      });

      it('handles max depth to prevent infinite recursion', () => {
        // Create deeply nested object
        let deep: Record<string, unknown> = { password: 'secret' };
        for (let i = 0; i < 15; i++) {
          deep = { nested: deep };
        }
        const result = redactSensitive(deep);
        expect(result).toBeDefined();
        // Should not throw and should handle deep nesting
      });
    });

    describe('Safe value handling', () => {
      it('handles null and undefined', () => {
        expect(redactSensitive(null)).toBeNull();
        expect(redactSensitive(undefined)).toBeUndefined();
      });

      it('handles primitive values', () => {
        expect(redactSensitive(123)).toBe(123);
        expect(redactSensitive(true)).toBe(true);
        expect(redactSensitive('safe string')).toBe('safe string');
      });

      it('preserves non-sensitive fields', () => {
        const input = {
          id: 'abc123',
          name: 'John',
          status: 'active',
          count: 42,
        };
        const result = redactSensitive(input) as Record<string, unknown>;
        expect(result.id).toBe('abc123');
        expect(result.name).toBe('John');
        expect(result.status).toBe('active');
        expect(result.count).toBe(42);
      });
    });
  });
});
