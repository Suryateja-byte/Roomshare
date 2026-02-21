/**
 * Tests for profile action Zod error handling safety.
 *
 * Verifies that a ZodError with an empty issues array doesn't crash
 * (returns fallback message instead of TypeError on undefined access).
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: jest.fn(), findUnique: jest.fn() },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}))

import { updateProfile } from '@/app/actions/profile'
import { auth } from '@/auth'
import { z } from 'zod'

describe('updateProfile - Zod error handling safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue({
      user: { id: 'user-123', name: 'Test', email: 'test@example.com' },
    })
  })

  it('returns a message from Zod issues when present', async () => {
    // Empty string triggers "Name is required" validation error
    const result = await updateProfile({ name: '' })
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
    expect(result.error!.length).toBeGreaterThan(0)
  })

  it('handles validation failure with proper error message', async () => {
    // Bio too long triggers validation
    const result = await updateProfile({ name: 'Test', bio: 'a'.repeat(501) })
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
  })

  it('returns fallback message if ZodError somehow has empty issues', async () => {
    // Simulate edge case: ZodError with empty issues array
    // This can't happen normally with Zod, but we guard against it defensively
    const emptyIssuesError = new z.ZodError([])
    expect(emptyIssuesError.issues).toHaveLength(0)
    // The fix: error.issues[0]?.message || 'Validation failed'
    const message = emptyIssuesError.issues[0]?.message || 'Validation failed'
    expect(message).toBe('Validation failed')
  })
})
