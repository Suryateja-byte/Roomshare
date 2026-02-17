/**
 * Tests for notifications utility
 * Validates internal notification creation and error handling
 */

import { prisma } from '@/lib/prisma';

// Mock the logger before importing the module under test
jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import {
  createInternalNotification,
  type NotificationType,
  type CreateNotificationInput,
} from '@/lib/notifications';
import { logger } from '@/lib/logger';

const mockNotificationCreate = prisma.notification.create as jest.Mock;

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInternalNotification', () => {
    const baseInput: CreateNotificationInput = {
      userId: 'user-123',
      type: 'BOOKING_REQUEST',
      title: 'New Booking Request',
      message: 'You have a new booking request for your listing.',
    };

    it('creates a notification in the database', async () => {
      mockNotificationCreate.mockResolvedValue({
        id: 'notif-1',
        ...baseInput,
        createdAt: new Date(),
      });

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ success: true });
      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          type: 'BOOKING_REQUEST',
          title: 'New Booking Request',
          message: 'You have a new booking request for your listing.',
          link: undefined,
        },
      });
    });

    it('passes optional link to database', async () => {
      mockNotificationCreate.mockResolvedValue({});

      const inputWithLink: CreateNotificationInput = {
        ...baseInput,
        link: '/bookings/booking-456',
      };

      await createInternalNotification(inputWithLink);

      expect(mockNotificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          link: '/bookings/booking-456',
        }),
      });
    });

    it('handles database error gracefully', async () => {
      mockNotificationCreate.mockRejectedValue(new Error('DB connection failed'));

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ error: 'Failed to create notification' });
    });

    it('logs error details on failure without PII', async () => {
      mockNotificationCreate.mockRejectedValue(new Error('Unique constraint violation'));

      await createInternalNotification(baseInput);

      expect((logger.sync.error as jest.Mock)).toHaveBeenCalledWith(
        'Failed to create notification',
        expect.objectContaining({
          action: 'createInternalNotification',
          userId: 'user-123',
          type: 'BOOKING_REQUEST',
          error: 'Unique constraint violation',
        }),
      );
    });

    it('handles non-Error thrown objects', async () => {
      mockNotificationCreate.mockRejectedValue('string error');

      const result = await createInternalNotification(baseInput);

      expect(result).toEqual({ error: 'Failed to create notification' });
      expect((logger.sync.error as jest.Mock)).toHaveBeenCalledWith(
        'Failed to create notification',
        expect.objectContaining({
          error: 'Unknown error',
        }),
      );
    });

    describe('notification types', () => {
      const allTypes: NotificationType[] = [
        'BOOKING_REQUEST',
        'BOOKING_ACCEPTED',
        'BOOKING_REJECTED',
        'BOOKING_CANCELLED',
        'NEW_MESSAGE',
        'NEW_REVIEW',
        'LISTING_SAVED',
        'SEARCH_ALERT',
      ];

      it.each(allTypes)('creates notification with type %s', async (type) => {
        mockNotificationCreate.mockResolvedValue({});

        const input: CreateNotificationInput = {
          ...baseInput,
          type,
        };

        const result = await createInternalNotification(input);

        expect(result).toEqual({ success: true });
        expect(mockNotificationCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({ type }),
        });
      });
    });
  });
});
