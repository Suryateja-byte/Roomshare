/**
 * Tests for normalize-email utility
 * Validates consistent email normalization for lookups and deduplication
 */

import { normalizeEmail } from '@/lib/normalize-email';

describe('normalizeEmail', () => {
  describe('lowercase conversion', () => {
    it('converts uppercase email to lowercase', () => {
      expect(normalizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com');
    });

    it('converts mixed-case email to lowercase', () => {
      expect(normalizeEmail('John.Doe@Gmail.Com')).toBe('john.doe@gmail.com');
    });

    it('leaves already-lowercase email unchanged', () => {
      expect(normalizeEmail('user@example.com')).toBe('user@example.com');
    });
  });

  describe('trimming', () => {
    it('trims leading whitespace', () => {
      expect(normalizeEmail('  user@example.com')).toBe('user@example.com');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeEmail('user@example.com  ')).toBe('user@example.com');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('trims tabs and newlines', () => {
      expect(normalizeEmail('\tuser@example.com\n')).toBe('user@example.com');
    });
  });

  describe('combined normalization', () => {
    it('lowercases and trims simultaneously', () => {
      expect(normalizeEmail('  USER@EXAMPLE.COM  ')).toBe('user@example.com');
    });
  });

  describe('special characters in email', () => {
    it('preserves dots in local part', () => {
      expect(normalizeEmail('first.last@example.com')).toBe('first.last@example.com');
    });

    it('preserves plus alias in local part', () => {
      expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
    });

    it('preserves hyphens in domain', () => {
      expect(normalizeEmail('user@my-domain.com')).toBe('user@my-domain.com');
    });

    it('preserves underscores in local part', () => {
      expect(normalizeEmail('user_name@example.com')).toBe('user_name@example.com');
    });

    it('preserves subdomains', () => {
      expect(normalizeEmail('user@mail.example.co.uk')).toBe('user@mail.example.co.uk');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(normalizeEmail('')).toBe('');
    });

    it('handles whitespace-only string', () => {
      expect(normalizeEmail('   ')).toBe('');
    });

    it('handles string without @ symbol', () => {
      // normalizeEmail does not validate format, it just normalizes
      expect(normalizeEmail('NOT-AN-EMAIL')).toBe('not-an-email');
    });

    it('handles email with multiple @ symbols', () => {
      // The function does lowercasing/trimming, not validation
      expect(normalizeEmail('user@@example.com')).toBe('user@@example.com');
    });

    it('handles single character email parts', () => {
      expect(normalizeEmail('A@B.CO')).toBe('a@b.co');
    });

    it('handles very long email', () => {
      const longLocal = 'a'.repeat(64);
      const longDomain = 'b'.repeat(63) + '.com';
      const longEmail = `${longLocal}@${longDomain}`;
      expect(normalizeEmail(longEmail)).toBe(longEmail.toLowerCase());
    });
  });
});
