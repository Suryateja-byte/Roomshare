/**
 * Tests for verification server actions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    verificationRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}))

import {
  submitVerificationRequest,
  getMyVerificationStatus,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
  cancelVerificationRequest,
} from '@/app/actions/verification'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { sendNotificationEmail } from '@/lib/email'

describe('Verification Actions', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('submitVerificationRequest', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await submitVerificationRequest({
        documentType: 'passport',
        documentUrl: 'https://example.com/doc.jpg',
      })

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error if pending request exists', async () => {
      ;(prisma.verificationRequest.findFirst as jest.Mock).mockResolvedValue({
        id: 'request-123',
        status: 'PENDING',
      })

      const result = await submitVerificationRequest({
        documentType: 'passport',
        documentUrl: 'https://example.com/doc.jpg',
      })

      expect(result).toEqual({ error: 'You already have a pending verification request' })
    })

    it('returns error if user is already verified', async () => {
      ;(prisma.verificationRequest.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: true })

      const result = await submitVerificationRequest({
        documentType: 'passport',
        documentUrl: 'https://example.com/doc.jpg',
      })

      expect(result).toEqual({ error: 'You are already verified' })
    })

    it('creates verification request successfully', async () => {
      ;(prisma.verificationRequest.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: false })
      ;(prisma.verificationRequest.create as jest.Mock).mockResolvedValue({
        id: 'request-new',
      })

      const result = await submitVerificationRequest({
        documentType: 'driver_license',
        documentUrl: 'https://example.com/license.jpg',
        selfieUrl: 'https://example.com/selfie.jpg',
      })

      expect(prisma.verificationRequest.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          documentType: 'driver_license',
          documentUrl: 'https://example.com/license.jpg',
          selfieUrl: 'https://example.com/selfie.jpg',
        },
      })
      expect(result).toEqual({ success: true, requestId: 'request-new' })
      expect(revalidatePath).toHaveBeenCalledWith('/profile')
      expect(revalidatePath).toHaveBeenCalledWith('/verify')
    })

    it('handles database errors', async () => {
      ;(prisma.verificationRequest.findFirst as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await submitVerificationRequest({
        documentType: 'passport',
        documentUrl: 'https://example.com/doc.jpg',
      })

      expect(result).toEqual({ error: 'Failed to submit verification request' })
    })
  })

  describe('getMyVerificationStatus', () => {
    it('returns not_logged_in when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getMyVerificationStatus()

      expect(result).toEqual({ status: 'not_logged_in' })
    })

    it('returns verified if user is verified', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: true })

      const result = await getMyVerificationStatus()

      expect(result).toEqual({ status: 'verified' })
    })

    it('returns pending with requestId', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: false })
      ;(prisma.verificationRequest.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'pending-123', status: 'PENDING' })

      const result = await getMyVerificationStatus()

      expect(result).toEqual({ status: 'pending', requestId: 'pending-123' })
    })

    it('returns rejected with reason', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: false })
      ;(prisma.verificationRequest.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // No pending
        .mockResolvedValueOnce({
          id: 'rejected-123',
          status: 'REJECTED',
          adminNotes: 'Document not clear',
        })

      const result = await getMyVerificationStatus()

      expect(result).toEqual({
        status: 'rejected',
        reason: 'Document not clear',
        requestId: 'rejected-123',
      })
    })

    it('returns not_started when no requests exist', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isVerified: false })
      ;(prisma.verificationRequest.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)

      const result = await getMyVerificationStatus()

      expect(result).toEqual({ status: 'not_started' })
    })

    it('returns error on database failure', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getMyVerificationStatus()

      expect(result).toEqual({ status: 'error' })
    })
  })

  describe('getPendingVerifications', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getPendingVerifications()

      expect(result).toEqual({ error: 'Unauthorized', requests: [] })
    })

    it('returns error when not admin', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false })

      const result = await getPendingVerifications()

      expect(result).toEqual({ error: 'Unauthorized', requests: [] })
    })

    it('returns pending verifications for admin', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      const mockRequests = [
        { id: 'req-1', user: { id: 'u1', name: 'User 1' } },
        { id: 'req-2', user: { id: 'u2', name: 'User 2' } },
      ]
      ;(prisma.verificationRequest.findMany as jest.Mock).mockResolvedValue(mockRequests)

      const result = await getPendingVerifications()

      expect(result).toEqual({ requests: mockRequests })
    })

    it('handles database errors', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getPendingVerifications()

      expect(result).toEqual({ error: 'Failed to fetch verifications', requests: [] })
    })
  })

  describe('approveVerification', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await approveVerification('request-123')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when not admin', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false })

      const result = await approveVerification('request-123')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when request not found', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await approveVerification('request-123')

      expect(result).toEqual({ error: 'Request not found' })
    })

    it('approves verification successfully', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'request-123',
        userId: 'user-456',
        user: { id: 'user-456', name: 'Test User', email: 'test@test.com' },
      })
      ;(prisma.verificationRequest.update as jest.Mock).mockResolvedValue({})
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})

      const result = await approveVerification('request-123')

      expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: {
          status: 'APPROVED',
          reviewedAt: expect.any(Date),
          reviewedBy: 'user-123',
        },
      })
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-456' },
        data: { isVerified: true },
      })
      expect(sendNotificationEmail).toHaveBeenCalled()
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await approveVerification('request-123')

      expect(result).toEqual({ error: 'Failed to approve verification' })
    })
  })

  describe('rejectVerification', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await rejectVerification('request-123', 'Invalid document')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when not admin', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false })

      const result = await rejectVerification('request-123', 'Invalid document')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when request not found', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await rejectVerification('request-123', 'Invalid document')

      expect(result).toEqual({ error: 'Request not found' })
    })

    it('rejects verification successfully', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'request-123',
      })
      ;(prisma.verificationRequest.update as jest.Mock).mockResolvedValue({})

      const result = await rejectVerification('request-123', 'Document not clear')

      expect(prisma.verificationRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: {
          status: 'REJECTED',
          adminNotes: 'Document not clear',
          reviewedAt: expect.any(Date),
          reviewedBy: 'user-123',
        },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/admin/verifications')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true })
      ;(prisma.verificationRequest.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await rejectVerification('request-123', 'reason')

      expect(result).toEqual({ error: 'Failed to reject verification' })
    })
  })

  describe('cancelVerificationRequest', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await cancelVerificationRequest()

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('cancels pending request successfully', async () => {
      ;(prisma.verificationRequest.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })

      const result = await cancelVerificationRequest()

      expect(prisma.verificationRequest.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          status: 'PENDING',
        },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/verify')
      expect(revalidatePath).toHaveBeenCalledWith('/profile')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.verificationRequest.deleteMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await cancelVerificationRequest()

      expect(result).toEqual({ error: 'Failed to cancel verification request' })
    })
  })
})
