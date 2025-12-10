/**
 * Tests for profile completion calculation
 */

import {
  calculateProfileCompletion,
  getMissingForAction,
  PROFILE_REQUIREMENTS,
} from '@/lib/profile-completion'

describe('Profile Completion', () => {
  describe('calculateProfileCompletion', () => {
    it('returns 0% for empty profile', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(0)
      expect(result.missing.length).toBe(7)
    })

    it('returns 100% for complete profile', () => {
      const user = {
        name: 'John Doe',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: 'This is a bio that is at least 20 characters long',
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: 'United States',
        languages: ['English'],
        isVerified: true,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(100)
      expect(result.missing.length).toBe(0)
    })

    it('adds 10% for valid name', () => {
      const withoutName = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const withName = { ...withoutName, name: 'Jo' } // Minimum 2 chars

      expect(calculateProfileCompletion(withName).percentage).toBe(10)
      expect(calculateProfileCompletion(withoutName).percentage).toBe(0)
    })

    it('requires name to be at least 2 characters', () => {
      const user = {
        name: 'J', // Only 1 char
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(0)
      expect(result.missing).toContain('Add your name')
    })

    it('adds 20% for verified email', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(20)
    })

    it('adds 15% for bio with at least 20 characters', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: 'This bio is exactly 20',
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(15)
    })

    it('requires bio to be at least 20 characters', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: 'Short bio',
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(0)
      expect(result.missing).toContain('Write a bio (at least 20 characters)')
    })

    it('adds 20% for profile image', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(20)
    })

    it('adds 10% for country of origin', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: 'United States',
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(10)
    })

    it('adds 10% for at least one language', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: ['English'],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(10)
    })

    it('adds 15% for ID verification', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: true,
      }

      const result = calculateProfileCompletion(user)

      expect(result.percentage).toBe(15)
    })

    it('tracks missing fields correctly', () => {
      const user = {
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      }

      const result = calculateProfileCompletion(user)

      expect(result.missing).toContain('Add your name')
      expect(result.missing).toContain('Verify your email')
      expect(result.missing).toContain('Write a bio (at least 20 characters)')
      expect(result.missing).toContain('Add a profile photo')
      expect(result.missing).toContain('Add your country of origin')
      expect(result.missing).toContain('Add languages you speak')
      expect(result.missing).toContain('Complete ID verification')
    })

    it('determines canCreateListing correctly (60% required)', () => {
      const lowPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      } // 30%

      const highPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: 'This is a bio that is at least 20 characters long',
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      } // 65%

      expect(calculateProfileCompletion(lowPercentage).canCreateListing).toBe(false)
      expect(calculateProfileCompletion(highPercentage).canCreateListing).toBe(true)
    })

    it('determines canSendMessages correctly (40% required)', () => {
      const lowPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: null,
        bio: null,
        image: null,
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      } // 10%

      const highPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: null,
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      } // 50%

      expect(calculateProfileCompletion(lowPercentage).canSendMessages).toBe(false)
      expect(calculateProfileCompletion(highPercentage).canSendMessages).toBe(true)
    })

    it('determines canBookRooms correctly (80% required)', () => {
      const mediumPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: 'This is a bio that is at least 20 characters long',
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: null,
        languages: [],
        isVerified: false,
      } // 65%

      const highPercentage = {
        name: 'Jo',
        email: 'test@example.com',
        emailVerified: new Date(),
        bio: 'This is a bio that is at least 20 characters long',
        image: 'https://example.com/avatar.jpg',
        countryOfOrigin: 'US',
        languages: ['English'],
        isVerified: true,
      } // 100%

      expect(calculateProfileCompletion(mediumPercentage).canBookRooms).toBe(false)
      expect(calculateProfileCompletion(highPercentage).canBookRooms).toBe(true)
    })
  })

  describe('getMissingForAction', () => {
    const completeUser = {
      name: 'Jo',
      email: 'test@example.com',
      emailVerified: new Date(),
      bio: 'This is a bio that is at least 20 characters long',
      image: 'https://example.com/avatar.jpg',
      countryOfOrigin: 'US',
      languages: ['English'],
      isVerified: true,
    }

    const incompleteUser = {
      name: null,
      email: 'test@example.com',
      emailVerified: null,
      bio: null,
      image: null,
      countryOfOrigin: null,
      languages: [],
      isVerified: false,
    }

    it('returns allowed true when percentage meets requirement', () => {
      const result = getMissingForAction(completeUser, 'createListing')

      expect(result.allowed).toBe(true)
      expect(result.percentage).toBe(100)
      expect(result.required).toBe(PROFILE_REQUIREMENTS.createListing)
    })

    it('returns allowed false when percentage below requirement', () => {
      const result = getMissingForAction(incompleteUser, 'createListing')

      expect(result.allowed).toBe(false)
      expect(result.percentage).toBe(0)
      expect(result.required).toBe(60)
    })

    it('provides correct requirements for sendMessages', () => {
      const result = getMissingForAction(incompleteUser, 'sendMessages')

      expect(result.required).toBe(40)
    })

    it('provides correct requirements for bookRooms', () => {
      const result = getMissingForAction(incompleteUser, 'bookRooms')

      expect(result.required).toBe(80)
    })

    it('includes missing fields in response', () => {
      const result = getMissingForAction(incompleteUser, 'createListing')

      expect(result.missing.length).toBe(7)
    })
  })

  describe('PROFILE_REQUIREMENTS', () => {
    it('has correct thresholds', () => {
      expect(PROFILE_REQUIREMENTS.createListing).toBe(60)
      expect(PROFILE_REQUIREMENTS.sendMessages).toBe(40)
      expect(PROFILE_REQUIREMENTS.bookRooms).toBe(80)
    })
  })
})
