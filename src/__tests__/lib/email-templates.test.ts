import { emailTemplates, baseTemplate } from '@/lib/email-templates'

describe('baseTemplate', () => {
  it('should wrap content in HTML email template', () => {
    const content = '<p>Test content</p>'
    const result = baseTemplate(content)

    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<html>')
    expect(result).toContain('</html>')
    expect(result).toContain('<p>Test content</p>')
  })

  it('should include RoomShare header', () => {
    const result = baseTemplate('<p>Test</p>')
    expect(result).toContain('RoomShare')
  })

  it('should include footer with copyright', () => {
    const result = baseTemplate('<p>Test</p>')
    expect(result).toContain('support@roomshare.com')
    expect(result).toContain(new Date().getFullYear().toString())
  })

  it('should include proper meta tags', () => {
    const result = baseTemplate('<p>Test</p>')
    expect(result).toContain('charset="utf-8"')
    expect(result).toContain('viewport')
  })
})

describe('emailTemplates', () => {
  describe('bookingRequest', () => {
    it('should generate booking request email', () => {
      const data = {
        hostName: 'John Host',
        tenantName: 'Jane Tenant',
        listingTitle: 'Cozy Room',
        startDate: 'February 1, 2024',
        endDate: 'August 1, 2024',
        listingId: 'listing-123',
      }

      const result = emailTemplates.bookingRequest(data)

      expect(result.subject).toBe('New booking request for Cozy Room')
      expect(result.html).toContain('Hi John Host')
      expect(result.html).toContain('Jane Tenant')
      expect(result.html).toContain('Cozy Room')
      expect(result.html).toContain('February 1, 2024')
      expect(result.html).toContain('August 1, 2024')
      expect(result.html).toContain('/bookings')
    })

    it('should escape user-controlled booking fields in HTML', () => {
      const data = {
        hostName: '<img src=x onerror=alert(1)>',
        tenantName: '<script>alert(1)</script>',
        listingTitle: '\"><b>Cozy</b>',
        startDate: '<svg/onload=alert(1)>',
        endDate: '2024-08-01',
        listingId: 'listing-123',
      }

      const result = emailTemplates.bookingRequest(data)

      expect(result.html).not.toContain('<script>alert(1)</script>')
      expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(result.html).toContain('&quot;&gt;&lt;b&gt;Cozy&lt;/b&gt;')
      expect(result.html).toContain('&lt;svg/onload=alert(1)&gt;')
    })
  })

  describe('bookingAccepted', () => {
    it('should generate booking accepted email', () => {
      const data = {
        tenantName: 'Jane Tenant',
        listingTitle: 'Cozy Room',
        hostName: 'John Host',
        startDate: 'February 1, 2024',
        listingId: 'listing-123',
      }

      const result = emailTemplates.bookingAccepted(data)

      expect(result.subject).toBe('Your booking for Cozy Room has been accepted!')
      expect(result.html).toContain('Booking Confirmed')
      expect(result.html).toContain('John Host')
      expect(result.html).toContain('February 1, 2024')
    })
  })

  describe('bookingRejected', () => {
    it('should generate booking rejected email', () => {
      const data = {
        tenantName: 'Jane Tenant',
        listingTitle: 'Cozy Room',
        hostName: 'John Host',
      }

      const result = emailTemplates.bookingRejected(data)

      expect(result.subject).toBe('Update on your booking request for Cozy Room')
      expect(result.html).toContain('unable to accept')
      expect(result.html).toContain('/search')
    })
  })

  describe('newMessage', () => {
    it('should generate new message email', () => {
      const data = {
        recipientName: 'John',
        senderName: 'Jane',
        messagePreview: 'Hello, I am interested in your listing!',
        conversationId: 'conv-123',
      }

      const result = emailTemplates.newMessage(data)

      expect(result.subject).toBe('New message from Jane')
      expect(result.html).toContain('Hi John')
      expect(result.html).toContain('Hello, I am interested in your listing!')
      expect(result.html).toContain('/messages/conv-123')
    })

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(200)
      const data = {
        recipientName: 'John',
        senderName: 'Jane',
        messagePreview: longMessage,
        conversationId: 'conv-123',
      }

      const result = emailTemplates.newMessage(data)

      expect(result.html).toContain('...')
      expect(result.html).not.toContain(longMessage)
    })

    it('should escape message fields and encode conversation id in link', () => {
      const data = {
        recipientName: '<img src=x onerror=alert(1)>',
        senderName: '<script>alert(1)</script>',
        messagePreview: '\"><b>hello</b>',
        conversationId: '../../"><script>alert(1)</script>',
      }

      const result = emailTemplates.newMessage(data)

      expect(result.subject).toBe('New message from <script>alert(1)</script>')
      expect(result.html).not.toContain('<script>alert(1)</script>')
      expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(result.html).toContain('&quot;&gt;&lt;b&gt;hello&lt;/b&gt;')
      expect(result.html).toContain('/messages/..%2F..%2F%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E')
    })
  })

  describe('newReview', () => {
    it('should generate new review email', () => {
      const data = {
        hostName: 'John Host',
        reviewerName: 'Jane',
        listingTitle: 'Cozy Room',
        rating: 5,
        listingId: 'listing-123',
      }

      const result = emailTemplates.newReview(data)

      expect(result.subject).toBe('New 5-star review on Cozy Room')
      expect(result.html).toContain('Hi John Host')
      expect(result.html).toContain('Jane')
      expect(result.html).toContain('/listings/listing-123')
    })

    it('should show correct star rating', () => {
      const data = {
        hostName: 'Host',
        reviewerName: 'Reviewer',
        listingTitle: 'Room',
        rating: 3,
        listingId: 'listing-123',
      }

      const result = emailTemplates.newReview(data)

      // Should have 3 filled stars and 2 empty stars
      expect(result.html).toContain('★★★☆☆')
    })
  })

  describe('listingSaved', () => {
    it('should generate listing saved email', () => {
      const data = {
        hostName: 'John Host',
        saverName: 'Jane',
        listingTitle: 'Cozy Room',
        listingId: 'listing-123',
      }

      const result = emailTemplates.listingSaved(data)

      expect(result.subject).toBe('Someone saved your listing "Cozy Room"')
      expect(result.html).toContain('Getting Attention')
      expect(result.html).toContain('Jane')
    })
  })

  describe('searchAlert', () => {
    it('should generate search alert email', () => {
      const data = {
        userName: 'John',
        searchQuery: 'q=downtown&minPrice=500',
        newListingsCount: 5,
        searchId: 'search-123',
      }

      const result = emailTemplates.searchAlert(data)

      expect(result.subject).toBe('5 new listings match your search')
      expect(result.html).toContain('Hi John')
      expect(result.html).toContain('5 new listings')
    })

    it('should handle singular listing', () => {
      const data = {
        userName: 'John',
        searchQuery: 'q=test',
        newListingsCount: 1,
        searchId: 'search-123',
      }

      const result = emailTemplates.searchAlert(data)

      expect(result.subject).toBe('1 new listings match your search')
    })

    it('should escape user-controlled search fields in HTML', () => {
      const data = {
        userName: '<img src=x onerror=alert(1)>',
        searchQuery: '\"><script>alert(1)</script>',
        newListingsCount: 2,
        searchId: 'search-123',
      }

      const result = emailTemplates.searchAlert(data)

      expect(result.html).not.toContain('<script>alert(1)</script>')
      expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(result.html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('should encode search query in alert link', () => {
      const data = {
        userName: 'John',
        searchQuery: 'Austin & Pets',
        newListingsCount: 3,
        searchId: 'search-123',
      }

      const result = emailTemplates.searchAlert(data)

      expect(result.html).toContain('/search?q=Austin%20%26%20Pets')
    })
  })

  describe('welcomeEmail', () => {
    it('should generate welcome email', () => {
      const data = { userName: 'John' }

      const result = emailTemplates.welcomeEmail(data)

      expect(result.subject).toBe('Welcome to RoomShare, John!')
      expect(result.html).toContain('thrilled to have you')
      expect(result.html).toContain('/profile/edit')
    })
  })

  describe('passwordReset', () => {
    it('should generate password reset email', () => {
      const data = {
        userName: 'John',
        resetLink: 'https://roomshare.com/reset?token=abc123',
      }

      const result = emailTemplates.passwordReset(data)

      expect(result.subject).toBe('Reset your RoomShare password')
      expect(result.html).toContain('Hi John')
      expect(result.html).toContain('https://roomshare.com/reset?token=abc123')
      expect(result.html).toContain('expire in 1 hour')
    })
  })

  describe('reviewResponse', () => {
    it('should generate review response email', () => {
      const data = {
        reviewerName: 'Jane',
        hostName: 'John Host',
        listingTitle: 'Cozy Room',
        responsePreview: 'Thank you for your feedback!',
        listingId: 'listing-123',
      }

      const result = emailTemplates.reviewResponse(data)

      expect(result.subject).toBe('John Host responded to your review')
      expect(result.html).toContain('Hi Jane')
      expect(result.html).toContain('Thank you for your feedback!')
    })

    it('should truncate long responses', () => {
      const longResponse = 'B'.repeat(300)
      const data = {
        reviewerName: 'Jane',
        hostName: 'John Host',
        listingTitle: 'Room',
        responsePreview: longResponse,
        listingId: 'listing-123',
      }

      const result = emailTemplates.reviewResponse(data)

      expect(result.html).toContain('...')
    })
  })
})
