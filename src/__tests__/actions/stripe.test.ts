/**
 * Tests for stripe server actions
 */

const mockRedirect = jest.fn()

jest.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  redirect: (...args: any[]) => {
    mockRedirect(...args)
    throw new Error('NEXT_REDIRECT')
  },
}))

import { createVerificationSession } from '@/app/actions/stripe'
import { stripe } from '@/lib/stripe'
import { auth } from '@/auth'

describe('Stripe Actions', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  describe('createVerificationSession', () => {
    it('redirects when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      await expect(createVerificationSession()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/api/auth/signin')
    })

    it('creates checkout session successfully', async () => {
      ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
        url: 'https://checkout.stripe.com/session123',
      })

      const result = await createVerificationSession()

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'RoomShare Verified Badge',
                description: 'Get a verified badge on your profile to build trust.',
              },
              unit_amount: 500,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: 'http://localhost:3000/?verified=true',
        cancel_url: 'http://localhost:3000/?verified=false',
        metadata: {
          userId: 'user-123',
        },
        customer_email: 'test@example.com',
      })
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session123' })
    })

    it('throws error when checkout session has no URL', async () => {
      ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
        url: null,
      })

      await expect(createVerificationSession()).rejects.toThrow('Failed to initiate verification')
    })

    it('handles stripe API errors', async () => {
      ;(stripe.checkout.sessions.create as jest.Mock).mockRejectedValue(
        new Error('Stripe API Error')
      )

      await expect(createVerificationSession()).rejects.toThrow('Failed to initiate verification')
    })

    it('handles undefined email', async () => {
      ;(auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-123', name: 'Test User', email: null },
      })
      ;(stripe.checkout.sessions.create as jest.Mock).mockResolvedValue({
        url: 'https://checkout.stripe.com/session123',
      })

      await createVerificationSession()

      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_email: undefined,
        })
      )
    })
  })
})
