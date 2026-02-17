/**
 * Tests for token-security utility functions
 *
 * Verifies SHA-256 hashing, token pair creation, and format validation.
 */

import { hashToken, createTokenPair, isValidTokenFormat } from '@/lib/token-security'

describe('token-security', () => {
  describe('hashToken', () => {
    it('produces consistent SHA-256 hex output for the same input', () => {
      const token = 'abc123'
      const hash1 = hashToken(token)
      const hash2 = hashToken(token)

      expect(hash1).toBe(hash2)
    })

    it('returns a 64-character lowercase hex string', () => {
      const hash = hashToken('test-token')

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces different hashes for different inputs', () => {
      const hash1 = hashToken('token-a')
      const hash2 = hashToken('token-b')

      expect(hash1).not.toBe(hash2)
    })

    it('matches known SHA-256 value for empty string', () => {
      // SHA-256 of "" is e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      const hash = hashToken('')

      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('handles unicode input', () => {
      const hash = hashToken('\u{1F600}\u{1F4A9}') // emoji

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('handles very long tokens', () => {
      const longToken = 'a'.repeat(10_000)
      const hash = hashToken(longToken)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('is case-sensitive (different inputs produce different hashes)', () => {
      const hashLower = hashToken('abc')
      const hashUpper = hashToken('ABC')

      expect(hashLower).not.toBe(hashUpper)
    })
  })

  describe('createTokenPair', () => {
    it('returns an object with token and tokenHash properties', () => {
      const pair = createTokenPair()

      expect(pair).toHaveProperty('token')
      expect(pair).toHaveProperty('tokenHash')
    })

    it('token is a 64-character hex string (32 random bytes)', () => {
      const { token } = createTokenPair()

      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[a-f0-9]{64}$/i)
    })

    it('tokenHash is the SHA-256 of token', () => {
      const { token, tokenHash } = createTokenPair()

      expect(tokenHash).toBe(hashToken(token))
    })

    it('generates unique tokens on successive calls', () => {
      const pair1 = createTokenPair()
      const pair2 = createTokenPair()

      expect(pair1.token).not.toBe(pair2.token)
      expect(pair1.tokenHash).not.toBe(pair2.tokenHash)
    })
  })

  describe('isValidTokenFormat', () => {
    it('accepts a valid 64-character hex string', () => {
      const { token } = createTokenPair()

      expect(isValidTokenFormat(token)).toBe(true)
    })

    it('accepts lowercase hex', () => {
      expect(isValidTokenFormat('a'.repeat(64))).toBe(true)
    })

    it('accepts uppercase hex', () => {
      expect(isValidTokenFormat('A'.repeat(64))).toBe(true)
    })

    it('accepts mixed-case hex', () => {
      expect(isValidTokenFormat('aAbBcCdDeEfF0011223344556677889900aAbBcCdDeEfF001122334455667788')).toBe(true)
    })

    it('rejects empty string', () => {
      expect(isValidTokenFormat('')).toBe(false)
    })

    it('rejects tokens shorter than 64 characters', () => {
      expect(isValidTokenFormat('abcdef1234567890'.repeat(3))).toBe(false) // 48 chars
    })

    it('rejects tokens longer than 64 characters', () => {
      expect(isValidTokenFormat('a'.repeat(65))).toBe(false)
    })

    it('rejects non-hex characters', () => {
      expect(isValidTokenFormat('g'.repeat(64))).toBe(false)
      expect(isValidTokenFormat('z'.repeat(64))).toBe(false)
    })

    it('rejects strings with spaces', () => {
      expect(isValidTokenFormat(' '.repeat(64))).toBe(false)
    })

    it('rejects strings with special characters', () => {
      expect(isValidTokenFormat('!@#$%^&*()_+-=[]'.repeat(4))).toBe(false)
    })
  })

  describe('token comparison (hash-based)', () => {
    it('matching tokens produce identical hashes', () => {
      const { token } = createTokenPair()

      expect(hashToken(token)).toBe(hashToken(token))
    })

    it('different tokens produce different hashes', () => {
      const pair1 = createTokenPair()
      const pair2 = createTokenPair()

      expect(hashToken(pair1.token)).not.toBe(hashToken(pair2.token))
    })

    it('comparing stored hash to re-hashed input validates correctly', () => {
      const { token, tokenHash: storedHash } = createTokenPair()

      // Simulate verification: user provides token, server re-hashes and compares
      const recomputed = hashToken(token)

      expect(recomputed).toBe(storedHash)
    })

    it('tampered token fails verification', () => {
      const { tokenHash: storedHash } = createTokenPair()

      // Attacker provides a different token
      const tamperedHash = hashToken('attacker-supplied-token')

      expect(tamperedHash).not.toBe(storedHash)
    })
  })
})
