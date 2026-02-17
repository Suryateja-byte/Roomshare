/**
 * Shared Test Factories
 *
 * Provides factory functions that return full mock objects with sensible defaults.
 * Every factory accepts an optional `overrides` parameter to customize any field.
 *
 * Usage:
 *   import { createMockUser, createMockListing } from '@/__tests__/utils/factories'
 *   const user = createMockUser({ isAdmin: true })
 *   const listing = createMockListing({ price: 1200, ownerId: user.id })
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: null as Date | null,
    image: '/avatar.jpg',
    password: null as string | null,
    bio: null as string | null,
    countryOfOrigin: null as string | null,
    languages: [] as string[],
    isVerified: false,
    isAdmin: false,
    isSuspended: false,
    notificationPreferences: null as Record<string, unknown> | null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export function createMockListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-123',
    ownerId: 'owner-123',
    title: 'Cozy Room in Downtown',
    description: 'A beautiful cozy room in the heart of downtown.',
    price: 800,
    images: ['/image1.jpg', '/image2.jpg'] as string[],
    amenities: ['WiFi', 'Parking', 'Laundry'] as string[],
    houseRules: ['No Smoking', 'No Pets'] as string[],
    leaseDuration: '6 months' as string | null,
    roomType: 'Private' as string | null,
    householdLanguages: [] as string[],
    primaryHomeLanguage: null as string | null,
    genderPreference: null as string | null,
    householdGender: null as string | null,
    totalSlots: 3,
    availableSlots: 2,
    moveInDate: new Date('2024-02-01T00:00:00Z') as Date | null,
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED' | 'RENTED',
    viewCount: 100,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export function createMockBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-123',
    listingId: 'listing-123',
    tenantId: 'user-123',
    startDate: new Date('2024-02-01T00:00:00Z'),
    endDate: new Date('2024-08-01T00:00:00Z'),
    status: 'PENDING' as 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
    totalPrice: 4800,
    rejectionReason: null as string | null,
    version: 1,
    createdAt: new Date('2024-01-15T00:00:00Z'),
    updatedAt: new Date('2024-01-15T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export function createMockConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conversation-123',
    listingId: 'listing-123',
    createdAt: new Date('2024-01-10T00:00:00Z'),
    updatedAt: new Date('2024-01-10T00:00:00Z'),
    deletedAt: null as Date | null,
    participants: [
      { id: 'user-123', name: 'Test User', image: '/avatar.jpg' },
      { id: 'owner-123', name: 'Owner', image: '/owner.jpg' },
    ],
    messages: [
      {
        id: 'message-1',
        content: 'Hello!',
        senderId: 'user-123',
        createdAt: new Date('2024-01-10T12:00:00Z'),
      },
    ],
    listing: { title: 'Cozy Room in Downtown' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Session (next-auth compatible)
// ---------------------------------------------------------------------------

export function createMockSession(
  overrides: Record<string, unknown> = {},
) {
  const {
    user: userOverrides,
    ...sessionOverrides
  } = overrides as { user?: Record<string, unknown>; [key: string]: unknown }

  return {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: '/avatar.jpg',
      emailVerified: null as Date | null,
      isAdmin: false,
      isSuspended: false,
      ...userOverrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    ...sessionOverrides,
  }
}
