import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { SessionProvider } from 'next-auth/react'

// Mock session data
export const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  image: '/avatar.jpg',
  emailVerified: null as Date | null,
  isAdmin: false,
  isSuspended: false,
}

export const mockSession = {
  user: mockUser,
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
}

export const mockListing = {
  id: 'listing-123',
  title: 'Cozy Room in Downtown',
  description: 'A beautiful cozy room in the heart of downtown.',
  price: 800,
  images: ['/image1.jpg', '/image2.jpg'],
  availableSlots: 2,
  totalSlots: 3,
  amenities: ['WiFi', 'Parking', 'Laundry'],
  houseRules: ['No Smoking', 'No Pets'],
  leaseDuration: '6 months',
  roomType: 'Private',
  moveInDate: new Date('2024-02-01'),
  ownerId: 'owner-123',
  createdAt: new Date('2024-01-01'),
  viewCount: 100,
  avgRating: 4.5,
  reviewCount: 10,
  location: {
    address: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zip: '94102',
    lat: 37.7749,
    lng: -122.4194,
  },
}

export const mockBooking = {
  id: 'booking-123',
  listingId: 'listing-123',
  tenantId: 'user-123',
  startDate: new Date('2024-02-01'),
  endDate: new Date('2024-08-01'),
  totalPrice: 4800,
  status: 'PENDING' as const,
  createdAt: new Date(),
}

export const mockConversation = {
  id: 'conversation-123',
  listingId: 'listing-123',
  participants: [
    { id: 'user-123', name: 'Test User', image: '/avatar.jpg' },
    { id: 'owner-123', name: 'Owner', image: '/owner.jpg' },
  ],
  messages: [
    {
      id: 'message-1',
      content: 'Hello!',
      senderId: 'user-123',
      createdAt: new Date(),
    },
  ],
  listing: { title: 'Cozy Room in Downtown' },
  updatedAt: new Date(),
}

export const mockReview = {
  id: 'review-123',
  rating: 5,
  comment: 'Great place!',
  authorId: 'user-123',
  listingId: 'listing-123',
  targetUserId: 'owner-123',
  createdAt: new Date(),
  author: {
    name: 'Test User',
    image: '/avatar.jpg',
  },
}

// Custom render with providers
interface AllProvidersProps {
  children: React.ReactNode
  session?: typeof mockSession | null
}

const AllProviders = ({ children, session = mockSession }: AllProvidersProps) => {
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { session?: typeof mockSession | null }
) => {
  const { session, ...renderOptions } = options || {}
  return render(ui, {
    wrapper: ({ children }) => <AllProviders session={session}>{children}</AllProviders>,
    ...renderOptions,
  })
}

export * from '@testing-library/react'
export { customRender as render }
