// Mock implementations for testing

// Prisma mock
export const prismaMock = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  listing: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  location: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  booking: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  conversation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  reviewResponse: {
    create: jest.fn(),
  },
  savedListing: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  savedSearch: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  notification: {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  verificationRequest: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  report: {
    create: jest.fn(),
  },
  recentlyViewed: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $transaction: jest.fn((fn) => fn(prismaMock)),
}

// Auth mock
export const mockAuth = jest.fn()

// Mock session helper
export const createMockSession = (overrides = {}) => ({
  user: {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    image: '/avatar.jpg',
    ...overrides,
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
})

// Mock fetch for API tests
export const createMockFetch = (response: any, ok = true) => {
  return jest.fn().mockResolvedValue({
    ok,
    json: jest.fn().mockResolvedValue(response),
    text: jest.fn().mockResolvedValue(JSON.stringify(response)),
  })
}

// Mock router
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
}

// Mock useSearchParams
export const mockSearchParams = new URLSearchParams()

// Reset all mocks helper
export const resetAllMocks = () => {
  jest.clearAllMocks()
  Object.values(prismaMock).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === 'function' && 'mockClear' in method) {
          (method as jest.Mock).mockClear()
        }
      })
    }
  })
}
