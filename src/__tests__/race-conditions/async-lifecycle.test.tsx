/**
 * Tests for async/lifecycle race condition fixes:
 * - ChatWindow: unmount during poll, duplicate message dedup
 * - SearchForm: unmount during geolocation callback
 * - Admin ListingList: double-click protection
 */

import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ChatWindow mocks
// ---------------------------------------------------------------------------

const mockGetMessages = jest.fn();
const mockSendMessage = jest.fn();
jest.mock('@/app/actions/chat', () => ({
    getMessages: (...args: unknown[]) => mockGetMessages(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

const mockBlockUser = jest.fn();
const mockUnblockUser = jest.fn();
jest.mock('@/app/actions/block', () => ({
    blockUser: (...args: unknown[]) => mockBlockUser(...args),
    unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
}));

jest.mock('@/lib/supabase', () => ({
    supabase: null, // disable realtime for these tests
    createChatChannel: jest.fn(),
    broadcastTyping: jest.fn(),
    trackPresence: jest.fn(),
    safeRemoveChannel: jest.fn(),
}));

jest.mock('use-debounce', () => ({
    useDebouncedCallback: (fn: (...args: unknown[]) => void) => fn,
}));

jest.mock('@/hooks/useBlockStatus', () => ({
    useBlockStatus: () => ({
        blockStatus: 'none',
        isBlocked: false,
        refetch: jest.fn(),
    }),
}));

jest.mock('@/hooks/useRateLimitHandler', () => ({
    useRateLimitHandler: () => ({
        isRateLimited: false,
        retryAfter: 0,
        handleError: jest.fn(() => false),
        reset: jest.fn(),
    }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('@/components/RateLimitCountdown', () => () => null);
jest.mock('@/components/CharacterCounter', () => () => null);
jest.mock('@/components/chat/BlockedConversationBanner', () => () => null);
jest.mock('@/components/UserAvatar', () => ({ name }: { name?: string }) => (
    <span data-testid="avatar">{name}</span>
));

jest.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
    AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogAction: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Admin mocks
// ---------------------------------------------------------------------------

const mockUpdateListingStatus = jest.fn();
const mockDeleteListing = jest.fn();
jest.mock('@/app/actions/admin', () => ({
    updateListingStatus: (...args: unknown[]) => mockUpdateListingStatus(...args),
    deleteListing: (...args: unknown[]) => mockDeleteListing(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import ChatWindow from '@/app/messages/[id]/ChatWindow';
import ListingList from '@/app/admin/listings/ListingList';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseChatProps = {
    initialMessages: [
        {
            id: 'msg-1',
            content: 'Hello',
            senderId: 'other-user',
            createdAt: new Date('2024-01-01T10:00:00Z'),
        },
    ],
    conversationId: 'conv-1',
    currentUserId: 'current-user',
    currentUserName: 'Me',
    otherUserId: 'other-user',
    otherUserName: 'Other',
    otherUserImage: null,
};

const baseAdminListings = [
    {
        id: 'listing-1',
        title: 'Test Listing',
        price: 1000,
        status: 'ACTIVE' as const,
        images: [],
        viewCount: 5,
        createdAt: new Date(),
        owner: { id: 'owner-1', name: 'Owner', email: 'owner@test.com' },
        location: { city: 'SF', state: 'CA' },
        _count: { reports: 0, bookings: 1 },
    },
];

// ---------------------------------------------------------------------------
// ChatWindow race condition tests
// ---------------------------------------------------------------------------

describe('ChatWindow async/lifecycle', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockGetMessages.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('does not call setState after unmount when poll resolves late', async () => {
        // Track console.error for "Can't perform a React state update on unmounted component"
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Make getMessages return a slow promise we control
        let resolveMessages!: (value: unknown) => void;
        mockGetMessages.mockReturnValue(
            new Promise((resolve) => { resolveMessages = resolve; })
        );

        const { unmount } = render(<ChatWindow {...baseChatProps} />);

        // Advance timers to trigger the polling interval (5s)
        act(() => { jest.advanceTimersByTime(5000); });

        // Unmount while the poll is still in-flight
        unmount();

        // Now resolve the in-flight poll
        await act(async () => {
            resolveMessages([
                { id: 'msg-2', content: 'Late', senderId: 'other-user', createdAt: new Date() },
            ]);
        });

        // No "setState on unmounted component" errors should appear
        const stateWarnings = errorSpy.mock.calls.filter(
            (args) => typeof args[0] === 'string' && args[0].includes('unmounted')
        );
        expect(stateWarnings).toHaveLength(0);

        errorSpy.mockRestore();
    });

    it('deduplicates messages during rapid polling', async () => {
        const sharedMessage = {
            id: 'msg-dup',
            content: 'Duplicate',
            senderId: 'other-user',
            createdAt: new Date('2024-01-01T11:00:00Z'),
        };

        // First poll returns the shared message
        mockGetMessages
            .mockResolvedValueOnce([sharedMessage])
            .mockResolvedValueOnce([sharedMessage]);

        render(<ChatWindow {...baseChatProps} />);

        // Trigger first poll
        await act(async () => { jest.advanceTimersByTime(5000); });
        // Wait for state update
        await act(async () => { await Promise.resolve(); });

        // Trigger second poll with same message
        await act(async () => { jest.advanceTimersByTime(5000); });
        await act(async () => { await Promise.resolve(); });

        // Only one instance of the message should appear
        const duplicateMessages = screen.getAllByText('Duplicate');
        expect(duplicateMessages).toHaveLength(1);
    });

    it('prevents concurrent poll re-entry with ref guard', async () => {
        // Make getMessages very slow so two intervals overlap
        let callCount = 0;
        mockGetMessages.mockImplementation(() => {
            callCount++;
            return new Promise((resolve) => setTimeout(() => resolve([]), 10000));
        });

        render(<ChatWindow {...baseChatProps} />);

        // First interval fires
        act(() => { jest.advanceTimersByTime(5000); });
        // Second interval fires while first is still pending
        act(() => { jest.advanceTimersByTime(5000); });

        // Only one actual call should have been made (ref guard blocks second)
        expect(callCount).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// SearchForm geolocation tests
// ---------------------------------------------------------------------------

describe('SearchForm geolocation unmount guard', () => {
    // We need to test that the geolocation callbacks don't fire after unmount.
    // Since SearchForm has many dependencies, we'll test the pattern directly.

    it('does not update state after unmount when geolocation resolves', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock geolocation to capture the callbacks
        let geoSuccessCallback: PositionCallback | null = null;
        const mockGetCurrentPosition = jest.fn(
            (success: PositionCallback) => {
                geoSuccessCallback = success;
            }
        );

        Object.defineProperty(navigator, 'geolocation', {
            value: { getCurrentPosition: mockGetCurrentPosition },
            configurable: true,
        });

        // We need to mock all SearchForm dependencies
        jest.doMock('@/contexts/SearchTransitionContext', () => ({
            useSearchTransitionSafe: () => null,
        }));
        jest.doMock('@/hooks/useRecentSearches', () => ({
            useRecentSearches: () => ({
                recentSearches: [],
                saveRecentSearch: jest.fn(),
                clearRecentSearches: jest.fn(),
            }),
        }));
        jest.doMock('@/hooks/useDebouncedFilterCount', () => ({
            useDebouncedFilterCount: () => ({
                formattedCount: '0',
                isLoading: false,
                boundsRequired: false,
            }),
        }));
        jest.doMock('@/hooks/useFacets', () => ({
            useFacets: () => ({ facets: null }),
        }));
        jest.doMock('@/hooks/useKeyboardShortcuts', () => ({
            useKeyboardShortcuts: jest.fn(),
        }));
        jest.doMock('@/hooks/useBatchedFilters', () => ({
            useBatchedFilters: () => ({
                pending: {
                    minPrice: '', maxPrice: '', moveInDate: '', leaseDuration: '',
                    roomType: '', amenities: [], houseRules: [], languages: [],
                    genderPreference: '', householdGender: '',
                },
                isDirty: false,
                setPending: jest.fn(),
                commit: jest.fn(),
            }),
        }));
        jest.doMock('@/components/LocationSearchInput', () => {
            return function MockInput(props: { placeholder?: string }) {
                return <input data-testid="location-input" placeholder={props.placeholder} readOnly />;
            };
        });
        jest.doMock('@/components/search/FilterModal', () => {
            return function MockFilterModal() { return null; };
        });
        jest.doMock('@/lib/search/natural-language-parser', () => ({
            parseNaturalLanguageQuery: jest.fn(),
            nlQueryToSearchParams: jest.fn(),
        }));
        jest.doMock('@/lib/search-params', () => ({
            VALID_AMENITIES: [],
            VALID_HOUSE_RULES: [],
        }));
        jest.doMock('@/lib/languages', () => ({
            SUPPORTED_LANGUAGES: {},
            getLanguageName: jest.fn(() => ''),
        }));

        // Dynamic import so mocks take effect
        const { default: SearchForm } = await import('@/components/SearchForm');

        const { unmount } = render(<SearchForm />);

        // Click the geolocation button
        const geoButton = screen.getByLabelText('Use my current location');
        fireEvent.click(geoButton);

        expect(mockGetCurrentPosition).toHaveBeenCalled();

        // Unmount before the geo callback fires
        unmount();

        // Fire the success callback after unmount — should be a no-op
        if (geoSuccessCallback) {
            act(() => {
                geoSuccessCallback!({
                    coords: { latitude: 37.77, longitude: -122.41 },
                } as GeolocationPosition);
            });
        }

        // No state-update-after-unmount warnings
        const stateWarnings = errorSpy.mock.calls.filter(
            (args) => typeof args[0] === 'string' && args[0].includes('unmounted')
        );
        expect(stateWarnings).toHaveLength(0);

        errorSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// Admin double-click protection tests
// ---------------------------------------------------------------------------

describe('Admin ListingList double-click protection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prevents duplicate status change on rapid double-click', async () => {
        // Make the first call take a long time
        let resolveFirst!: (value: unknown) => void;
        mockUpdateListingStatus
            .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
            .mockResolvedValue({ success: true });

        render(<ListingList initialListings={baseAdminListings} totalListings={1} />);

        // Open the menu
        const menuButton = screen.getByRole('button', { name: '' }); // MoreVertical icon button
        fireEvent.click(menuButton);

        // Find a status change button (e.g., "Set Paused")
        const pauseButton = screen.getByText('Set Paused');

        // Double-click rapidly
        fireEvent.click(pauseButton);
        fireEvent.click(pauseButton);

        // Only one call should have been made (ref guard blocks the second)
        expect(mockUpdateListingStatus).toHaveBeenCalledTimes(1);

        // Resolve the first call
        await act(async () => { resolveFirst({ success: true }); });
    });

    it('prevents duplicate delete on rapid double-click', async () => {
        let resolveDelete!: (value: unknown) => void;
        mockDeleteListing.mockReturnValue(
            new Promise((resolve) => { resolveDelete = resolve; })
        );

        render(<ListingList initialListings={baseAdminListings} totalListings={1} />);

        // Open menu
        const menuButton = screen.getByRole('button', { name: '' });
        fireEvent.click(menuButton);

        // Click "Delete Listing" to show confirmation
        const deleteButton = screen.getByText('Delete Listing');
        fireEvent.click(deleteButton);

        // Click "Delete Forever" rapidly
        const confirmButton = screen.getByText('Delete Forever');
        fireEvent.click(confirmButton);
        fireEvent.click(confirmButton);

        // Only one delete call should fire
        expect(mockDeleteListing).toHaveBeenCalledTimes(1);

        await act(async () => { resolveDelete({ success: true }); });
    });

    it('re-enables actions after processing completes', async () => {
        mockUpdateListingStatus.mockResolvedValue({ success: true });

        render(<ListingList initialListings={baseAdminListings} totalListings={1} />);

        // Open menu and click Set Paused
        const menuButton = screen.getByRole('button', { name: '' });
        fireEvent.click(menuButton);

        const pauseButton = screen.getByText('Set Paused');
        fireEvent.click(pauseButton);

        await act(async () => { await Promise.resolve(); });

        // After the first request completes, we should be able to make another
        expect(mockUpdateListingStatus).toHaveBeenCalledTimes(1);

        // Re-open menu and try another action
        // The listing is now PAUSED, so we should see "Set Active"
        const menuButton2 = screen.getByRole('button', { name: '' });
        fireEvent.click(menuButton2);

        const activeButton = screen.getByText('Set Active');
        fireEvent.click(activeButton);

        expect(mockUpdateListingStatus).toHaveBeenCalledTimes(2);
    });
});
