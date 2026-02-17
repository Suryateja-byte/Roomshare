import '@testing-library/jest-dom'
import 'whatwg-fetch'
import { TextEncoder, TextDecoder } from 'util'

// Polyfill TextEncoder/TextDecoder for Next.js server components
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Environment variables are now set in jest.env.js (via setupFiles)
// which runs BEFORE module imports to prevent initialization errors

// Polyfill Response.json static method for Next.js API routes
if (!Response.json) {
  Response.json = function(data, init = {}) {
    const body = JSON.stringify(data)
    const headers = new Headers(init.headers || {})
    headers.set('content-type', 'application/json')
    return new Response(body, {
      ...init,
      headers,
    })
  }
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}))

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: () => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    getAll: jest.fn(() => []),
    has: jest.fn(() => false),
  }),
  headers: () => ({
    get: jest.fn(),
    has: jest.fn(() => false),
    entries: jest.fn(() => []),
    keys: jest.fn(() => []),
    values: jest.fn(() => []),
    forEach: jest.fn(),
  }),
}))

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock next-auth (ESM module)
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
  getServerSession: jest.fn(),
}))

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: jest.fn(() => ({ data: null, status: 'unauthenticated' })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }) => children,
}))

// Mock next-auth providers
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'credentials', name: 'Credentials', type: 'credentials' })),
}))

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: jest.fn(() => ({ id: 'google', name: 'Google', type: 'oauth' })),
}))

// Mock @auth/prisma-adapter
jest.mock('@auth/prisma-adapter', () => ({
  __esModule: true,
  PrismaAdapter: jest.fn(() => ({})),
}))

// Mock @marsidev/react-turnstile (ESM-only package — prevents SyntaxError in Jest)
jest.mock('@marsidev/react-turnstile', () => {
  const React = require('react')
  return {
    __esModule: true,
    Turnstile: React.forwardRef(function MockTurnstile({ onSuccess }) {
      React.useEffect(() => {
        if (onSuccess) onSuccess('mock-turnstile-token')
      }, [onSuccess])
      return null
    }),
  }
})

// Mock @upstash/redis to prevent connection errors in tests
jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  })),
}))

// Mock @/lib/prisma to prevent PrismaClient initialization errors in tests
// Tests that need real DB access should set DATABASE_URL and use jest.unmock
const mockPrismaModel = {
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue({}),
  groupBy: jest.fn().mockResolvedValue([]),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
}

// Build the mock prisma client once so $transaction can pass it as the tx argument.
// This ensures code like `fn(tx)` inside $transaction receives a client with all
// model methods rather than an empty `{}`.
const mockPrismaClient = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $executeRaw: jest.fn().mockResolvedValue(0),
  $executeRawUnsafe: jest.fn().mockResolvedValue(0),
  $queryRaw: jest.fn().mockResolvedValue([]),
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  user: { ...mockPrismaModel },
  listing: { ...mockPrismaModel },
  location: { ...mockPrismaModel },
  review: { ...mockPrismaModel },
  booking: { ...mockPrismaModel },
  message: { ...mockPrismaModel },
  conversation: { ...mockPrismaModel },
  notification: { ...mockPrismaModel },
  account: { ...mockPrismaModel },
  session: { ...mockPrismaModel },
  verificationToken: { ...mockPrismaModel },
  hold: { ...mockPrismaModel },
  waitlist: { ...mockPrismaModel },
  spot: { ...mockPrismaModel },
  spotApplication: { ...mockPrismaModel },
  spotMessage: { ...mockPrismaModel },
  spotPhoto: { ...mockPrismaModel },
  block: { ...mockPrismaModel },
  idempotencyToken: { ...mockPrismaModel },
  idempotencyKey: { ...mockPrismaModel },
  rateLimit: { ...mockPrismaModel },
  rateLimitEntry: { ...mockPrismaModel },
  report: { ...mockPrismaModel },
  savedListing: { ...mockPrismaModel },
  savedSearch: { ...mockPrismaModel },
  reviewResponse: { ...mockPrismaModel },
  recentlyViewed: { ...mockPrismaModel },
  blockedUser: { ...mockPrismaModel },
  verificationRequest: { ...mockPrismaModel },
  auditLog: { ...mockPrismaModel },
  typingStatus: { ...mockPrismaModel },
  conversationDeletion: { ...mockPrismaModel },
  passwordResetToken: { ...mockPrismaModel },
  // listing_search_docs is a raw SQL table, no Prisma model
}

// Add $transaction to the client — interactive transactions receive the full client as `tx`
mockPrismaClient.$transaction = jest.fn((fn) =>
  typeof fn === 'function' ? fn(mockPrismaClient) : Promise.all(fn)
)

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrismaClient,
}))

// Mock window.matchMedia (only in jsdom environment)
if (typeof window !== 'undefined') Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback
  }
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}
global.IntersectionObserver = MockIntersectionObserver

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback
  }
  observe = jest.fn()
  unobserve = jest.fn()
  disconnect = jest.fn()
}
global.ResizeObserver = MockResizeObserver

// Mock scrollTo (only in jsdom environment)
if (typeof window !== 'undefined') window.scrollTo = jest.fn()

// Suppress console errors in tests unless in debug mode
const originalConsoleError = console.error
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
      args[0].includes('Warning: An update to') ||
      args[0].includes('act(...)'))
  ) {
    return
  }
  originalConsoleError.call(console, ...args)
}

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
})
