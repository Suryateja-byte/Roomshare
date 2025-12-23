import { Page } from '@playwright/test';

/**
 * Test data generation and management helpers
 */
export const dataHelpers = {
  /**
   * Generate unique test data prefix
   */
  uniquePrefix(): string {
    return `e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  },

  /**
   * Generate test listing data
   */
  generateListingData(overrides?: Partial<ListingData>): ListingData {
    const prefix = this.uniquePrefix();
    return {
      title: `Test Listing ${prefix}`,
      description: `This is a test listing created by E2E tests. ${prefix}`,
      price: 1000 + Math.floor(Math.random() * 1000),
      address: '123 Test Street',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      roomType: 'private',
      moveInDate: this.futureDate(30),
      amenities: ['wifi', 'parking'],
      ...overrides,
    };
  },

  /**
   * Generate test user data
   */
  generateUserData(overrides?: Partial<UserData>): UserData {
    const prefix = this.uniquePrefix();
    return {
      name: `Test User ${prefix.substring(0, 8)}`,
      email: `test-${prefix}@example.com`,
      password: 'TestPassword123!',
      bio: `I am a test user. ${prefix}`,
      phone: '555-0100',
      ...overrides,
    };
  },

  /**
   * Generate test booking data
   */
  generateBookingData(overrides?: Partial<BookingData>): BookingData {
    return {
      moveInDate: this.futureDate(30),
      moveOutDate: this.futureDate(90),
      message: `Test booking request ${this.uniquePrefix()}`,
      ...overrides,
    };
  },

  /**
   * Generate test message
   */
  generateMessage(): string {
    const messages = [
      'Hello, I am interested in this listing!',
      'Is this room still available?',
      'Can you tell me more about the neighborhood?',
      'What utilities are included?',
      'When can I schedule a viewing?',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  },

  /**
   * Generate test review data
   */
  generateReviewData(overrides?: Partial<ReviewData>): ReviewData {
    return {
      rating: 3 + Math.floor(Math.random() * 3), // 3-5 stars
      comment: `Great experience! ${this.uniquePrefix()}`,
      ...overrides,
    };
  },

  /**
   * Get a future date string (YYYY-MM-DD format)
   */
  futureDate(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  },

  /**
   * Get a past date string (YYYY-MM-DD format)
   */
  pastDate(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  },

  /**
   * Get today's date string (YYYY-MM-DD format)
   */
  today(): string {
    return new Date().toISOString().split('T')[0];
  },

  /**
   * Common test locations
   */
  locations: {
    sanFrancisco: { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
    losAngeles: { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    newYork: { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
    seattle: { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
    austin: { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  },

  /**
   * Common price ranges
   */
  priceRanges: {
    budget: { min: 500, max: 1000 },
    mid: { min: 1000, max: 2000 },
    luxury: { min: 2000, max: 5000 },
  },

  /**
   * Room types
   */
  roomTypes: ['private', 'shared', 'entire'] as const,

  /**
   * Amenities list
   */
  amenities: [
    'wifi',
    'parking',
    'laundry',
    'ac',
    'heating',
    'kitchen',
    'gym',
    'pool',
    'patio',
    'furnished',
    'pets_allowed',
    'utilities_included',
  ] as const,

  /**
   * Generate random amenities subset
   */
  randomAmenities(count = 3): string[] {
    const shuffled = [...this.amenities].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
  },

  /**
   * Test credit card (for payment testing if applicable)
   */
  testCard: {
    number: '4242424242424242',
    expiry: '12/30',
    cvc: '123',
    zip: '94102',
  },

  /**
   * Invalid form data for testing validation
   */
  invalidData: {
    email: 'not-an-email',
    shortPassword: '123',
    emptyString: '',
    negativePrice: -100,
    pastDate: '2020-01-01',
    tooLongText: 'x'.repeat(10001),
    specialChars: '<script>alert("xss")</script>',
    sqlInjection: "'; DROP TABLE users; --",
  },

  /**
   * Clean up test data created during tests
   * Note: Implement based on your cleanup strategy (API calls, database reset, etc.)
   */
  async cleanup(page: Page, testPrefix: string): Promise<void> {
    // This is a placeholder - implement based on your cleanup strategy
    // Options:
    // 1. Call cleanup API endpoint
    // 2. Delete via admin UI
    // 3. Database cleanup script
    console.log(`[E2E] Cleanup requested for prefix: ${testPrefix}`);
  },

  /**
   * Extract listing ID from URL
   */
  extractListingIdFromUrl(url: string): string | null {
    const match = url.match(/\/listings\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  },

  /**
   * Extract conversation ID from URL
   */
  extractConversationIdFromUrl(url: string): string | null {
    const match = url.match(/\/messages\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  },

  /**
   * Format price for display comparison
   */
  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  },

  /**
   * Format date for display comparison
   */
  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },
};

// Type definitions for test data

export interface ListingData {
  title: string;
  description: string;
  price: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  roomType: 'private' | 'shared' | 'entire';
  moveInDate: string;
  amenities: string[];
  images?: string[];
}

export interface UserData {
  name: string;
  email: string;
  password: string;
  bio?: string;
  phone?: string;
}

export interface BookingData {
  moveInDate: string;
  moveOutDate?: string;
  message?: string;
}

export interface ReviewData {
  rating: number;
  comment: string;
}
