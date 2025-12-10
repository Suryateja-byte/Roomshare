/**
 * Tests for search-alerts utility functions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    savedSearch: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    listing: {
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn(),
}))

import { processSearchAlerts, triggerInstantAlerts } from '@/lib/search-alerts'
import { prisma } from '@/lib/prisma'
import { sendNotificationEmail } from '@/lib/email'

describe('search-alerts', () => {
  const mockUser = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    notificationPreferences: { emailSearchAlerts: true },
  }

  const mockSavedSearch = {
    id: 'search-123',
    name: 'NYC Rooms',
    alertEnabled: true,
    alertFrequency: 'DAILY',
    lastAlertAt: null,
    createdAt: new Date('2025-01-01'),
    filters: { city: 'New York', minPrice: 500, maxPrice: 1500 },
    user: mockUser,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true })
  })

  describe('processSearchAlerts', () => {
    describe('finding saved searches', () => {
      it('processes searches with alerts enabled', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(result.processed).toBe(1)
        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              alertEnabled: true,
            }),
          })
        )
      })

      it('includes searches that have never been alerted', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        await processSearchAlerts()

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([{ lastAlertAt: null }]),
            }),
          })
        )
      })

      it('includes DAILY searches last alerted more than 24 hours ago', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([])

        await processSearchAlerts()

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  alertFrequency: 'DAILY',
                }),
              ]),
            }),
          })
        )
      })

      it('includes WEEKLY searches last alerted more than 7 days ago', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([])

        await processSearchAlerts()

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  alertFrequency: 'WEEKLY',
                }),
              ]),
            }),
          })
        )
      })

      it('includes user data with notification preferences', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([])

        await processSearchAlerts()

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              user: expect.objectContaining({
                select: expect.objectContaining({
                  notificationPreferences: true,
                }),
              }),
            }),
          })
        )
      })
    })

    describe('notification preferences', () => {
      it('skips user with disabled search alerts', async () => {
        const disabledUser = {
          ...mockUser,
          notificationPreferences: { emailSearchAlerts: false },
        }
        const searchWithDisabled = { ...mockSavedSearch, user: disabledUser }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithDisabled])
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(sendNotificationEmail).not.toHaveBeenCalled()
        expect(result.alertsSent).toBe(0)
      })

      it('skips user with no email', async () => {
        const noEmailUser = { ...mockUser, email: null }
        const searchWithNoEmail = { ...mockSavedSearch, user: noEmailUser }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithNoEmail])
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(sendNotificationEmail).not.toHaveBeenCalled()
        expect(result.alertsSent).toBe(0)
      })
    })

    describe('matching listings', () => {
      it('sends alert when new listings match', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(5)
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(result.alertsSent).toBe(1)
        expect(sendNotificationEmail).toHaveBeenCalledWith(
          'searchAlert',
          mockUser.email,
          expect.objectContaining({
            userName: mockUser.name,
            searchQuery: mockSavedSearch.name,
            newListingsCount: 5,
          })
        )
      })

      it('does not send alert when no matching listings', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(result.alertsSent).toBe(0)
        expect(sendNotificationEmail).not.toHaveBeenCalled()
      })

      it('creates in-app notification when listings match', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(3)
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        await processSearchAlerts()

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            type: 'SEARCH_ALERT',
          }),
        })
      })

      it('updates lastAlertAt after processing', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        await processSearchAlerts()

        expect(prisma.savedSearch.update).toHaveBeenCalledWith({
          where: { id: mockSavedSearch.id },
          data: { lastAlertAt: expect.any(Date) },
        })
      })
    })

    describe('error handling', () => {
      it('tracks errors for failed email sends', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch])
        ;(prisma.listing.count as jest.Mock).mockResolvedValue(5)
        ;(sendNotificationEmail as jest.Mock).mockResolvedValue({ success: false, error: 'Email failed' })
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(result.errors).toBe(1)
        expect(result.alertsSent).toBe(0)
      })

      it('continues processing after individual error', async () => {
        const secondSearch = { ...mockSavedSearch, id: 'search-456', user: { ...mockUser, id: 'user-456' } }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([mockSavedSearch, secondSearch])
        ;(prisma.listing.count as jest.Mock)
          .mockRejectedValueOnce(new Error('DB Error'))
          .mockResolvedValueOnce(3)
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await processSearchAlerts()

        expect(result.processed).toBe(2)
        expect(result.errors).toBe(1)
        expect(result.alertsSent).toBe(1)
      })

      it('handles fatal error gracefully', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(new Error('Fatal DB Error'))

        const result = await processSearchAlerts()

        expect(result.errors).toBe(1)
        expect(result.details).toEqual(expect.arrayContaining([expect.stringContaining('Fatal error')]))
      })
    })
  })

  describe('triggerInstantAlerts', () => {
    const newListing = {
      id: 'listing-123',
      title: 'Cozy Room in NYC',
      description: 'Great location',
      price: 1000,
      city: 'New York',
      state: 'NY',
      roomType: 'PRIVATE',
      leaseDuration: 'FLEXIBLE',
      amenities: ['WiFi', 'AC'],
      houseRules: ['No Smoking'],
    }

    const instantSearch = {
      ...mockSavedSearch,
      alertFrequency: 'INSTANT',
    }

    describe('finding instant alerts', () => {
      it('finds searches with INSTANT frequency', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([])

        await triggerInstantAlerts(newListing)

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              alertEnabled: true,
              alertFrequency: 'INSTANT',
            }),
          })
        )
      })

      it('includes user notification preferences', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([])

        await triggerInstantAlerts(newListing)

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              user: expect.objectContaining({
                select: expect.objectContaining({
                  notificationPreferences: true,
                }),
              }),
            }),
          })
        )
      })
    })

    describe('filter matching', () => {
      it('sends alert when listing matches filters', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([instantSearch])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(1)
        expect(sendNotificationEmail).toHaveBeenCalled()
      })

      it('does not send alert when price below minPrice', async () => {
        const searchWithHighMinPrice = {
          ...instantSearch,
          filters: { minPrice: 2000 },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithHighMinPrice])

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(0)
        expect(sendNotificationEmail).not.toHaveBeenCalled()
      })

      it('does not send alert when price above maxPrice', async () => {
        const searchWithLowMaxPrice = {
          ...instantSearch,
          filters: { maxPrice: 500 },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithLowMaxPrice])

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(0)
        expect(sendNotificationEmail).not.toHaveBeenCalled()
      })

      it('does not send alert when city does not match', async () => {
        const searchWithDifferentCity = {
          ...instantSearch,
          filters: { city: 'Los Angeles' },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithDifferentCity])

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(0)
      })

      it('matches city case-insensitively', async () => {
        const searchWithLowerCity = {
          ...instantSearch,
          filters: { city: 'new york' },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithLowerCity])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(1)
      })

      it('matches query in title', async () => {
        const searchWithQuery = {
          ...instantSearch,
          filters: { query: 'Cozy' },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithQuery])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(1)
      })

      it('matches query in description', async () => {
        const searchWithDescQuery = {
          ...instantSearch,
          filters: { query: 'location' },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([searchWithDescQuery])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(1)
      })
    })

    describe('notifications', () => {
      it('creates in-app notification with listing details', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([instantSearch])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        await triggerInstantAlerts(newListing)

        expect(prisma.notification.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            type: 'SEARCH_ALERT',
            link: `/listings/${newListing.id}`,
          }),
        })
      })

      it('updates lastAlertAt after sending', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([instantSearch])
        ;(prisma.notification.create as jest.Mock).mockResolvedValue({})
        ;(prisma.savedSearch.update as jest.Mock).mockResolvedValue({})

        await triggerInstantAlerts(newListing)

        expect(prisma.savedSearch.update).toHaveBeenCalledWith({
          where: { id: instantSearch.id },
          data: { lastAlertAt: expect.any(Date) },
        })
      })
    })

    describe('notification preferences', () => {
      it('skips user with disabled alerts', async () => {
        const disabledSearch = {
          ...instantSearch,
          user: { ...mockUser, notificationPreferences: { emailSearchAlerts: false } },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([disabledSearch])

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(0)
        expect(sendNotificationEmail).not.toHaveBeenCalled()
      })

      it('skips user without email', async () => {
        const noEmailSearch = {
          ...instantSearch,
          user: { ...mockUser, email: null },
        }
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([noEmailSearch])

        const result = await triggerInstantAlerts(newListing)

        expect(result.sent).toBe(0)
      })
    })

    describe('error handling', () => {
      it('tracks error for failed email', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([instantSearch])
        ;(sendNotificationEmail as jest.Mock).mockResolvedValue({ success: false, error: 'Failed' })

        const result = await triggerInstantAlerts(newListing)

        expect(result.errors).toBe(1)
        expect(result.sent).toBe(0)
      })

      it('handles fatal error gracefully', async () => {
        ;(prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await triggerInstantAlerts(newListing)

        expect(result.errors).toBe(1)
        expect(result.sent).toBe(0)
      })
    })
  })
})
