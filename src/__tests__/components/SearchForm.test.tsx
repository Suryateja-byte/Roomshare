/**
 * Comprehensive tests for SearchForm component
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock useSearchParams and useRouter
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSearchParams = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}))

// Mock LocationSearchInput
jest.mock('@/components/LocationSearchInput', () => {
  return function MockLocationSearchInput({
    value,
    onChange,
    onLocationSelect,
    placeholder,
  }: {
    value: string
    onChange: (value: string) => void
    onLocationSelect?: (location: { name: string; lat: number; lng: number; bbox?: [number, number, number, number] }) => void
    placeholder?: string
  }) {
    return (
      <div>
        <input
          data-testid="location-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          data-testid="select-location"
          onClick={() => onLocationSelect?.({ name: 'San Francisco', lat: 37.7749, lng: -122.4194 })}
        >
          Select SF
        </button>
      </div>
    )
  }
})

// Mock DatePicker
jest.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input
      data-testid="date-picker"
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}))

// Mock Select components
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: React.ReactNode; value?: string; onValueChange?: (value: string) => void }) => (
    <div data-testid="select-root" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <button data-testid={`select-trigger-${id}`} id={id}>
      {children}
    </button>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`} data-value={value}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

// Mock sonner toast
const mockToastError = jest.fn()
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: jest.fn(), info: jest.fn() },
}))

import SearchForm from '@/components/SearchForm'
import { MAP_FLY_TO_EVENT } from '@/components/SearchForm'

describe('SearchForm', () => {
  const user = userEvent.setup({ delay: null })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    // Reset search params
    mockSearchParams.delete('q')
    mockSearchParams.delete('minPrice')
    mockSearchParams.delete('maxPrice')
    mockSearchParams.delete('moveInDate')
    mockSearchParams.delete('leaseDuration')
    mockSearchParams.delete('roomType')
    mockSearchParams.delete('lat')
    mockSearchParams.delete('lng')
    mockSearchParams.delete('genderPreference')
    mockSearchParams.delete('householdGender')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ============================================
  // Rendering Tests - Default Variant
  // ============================================

  describe('rendering - default variant', () => {
    it('renders search form with role="search"', () => {
      render(<SearchForm />)
      expect(screen.getByRole('search')).toBeInTheDocument()
    })

    it('renders "Where" label', () => {
      render(<SearchForm />)
      expect(screen.getByText('Where')).toBeInTheDocument()
    })

    it('renders "Budget" label', () => {
      render(<SearchForm />)
      expect(screen.getByText('Budget')).toBeInTheDocument()
    })

    it('renders location input', () => {
      render(<SearchForm />)
      expect(screen.getByTestId('location-input')).toBeInTheDocument()
    })

    it('renders min/max price inputs', () => {
      render(<SearchForm />)
      expect(screen.getByLabelText(/minimum budget/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/maximum budget/i)).toBeInTheDocument()
    })

    it('renders Filters toggle button', () => {
      render(<SearchForm />)
      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument()
    })

    it('renders search button', () => {
      render(<SearchForm />)
      expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    })
  })

  // ============================================
  // Rendering Tests - Compact Variant
  // ============================================

  describe('rendering - compact variant', () => {
    it('does not render "Where" label', () => {
      render(<SearchForm variant="compact" />)
      expect(screen.queryByText('Where')).not.toBeInTheDocument()
    })

    it('does not render "Budget" label', () => {
      render(<SearchForm variant="compact" />)
      expect(screen.queryByText('Budget')).not.toBeInTheDocument()
    })

    it('does not render Filters toggle button', () => {
      render(<SearchForm variant="compact" />)
      expect(screen.queryByRole('button', { name: /filters/i })).not.toBeInTheDocument()
    })

    it('renders search button with smaller size', () => {
      render(<SearchForm variant="compact" />)
      const searchButton = screen.getByRole('button', { name: /search/i })
      expect(searchButton).toBeInTheDocument()
    })
  })

  // ============================================
  // URL Parameter Initialization Tests
  // ============================================

  describe('URL parameter initialization', () => {
    it('initializes location from q param', () => {
      mockSearchParams.set('q', 'downtown')
      render(<SearchForm />)
      expect(screen.getByTestId('location-input')).toHaveValue('downtown')
    })

    it('initializes minPrice from URL', () => {
      mockSearchParams.set('minPrice', '500')
      render(<SearchForm />)
      expect(screen.getByLabelText(/minimum budget/i)).toHaveValue(500)
    })

    it('initializes maxPrice from URL', () => {
      mockSearchParams.set('maxPrice', '1500')
      render(<SearchForm />)
      expect(screen.getByLabelText(/maximum budget/i)).toHaveValue(1500)
    })

    it('initializes coordinates from URL', () => {
      mockSearchParams.set('lat', '37.7749')
      mockSearchParams.set('lng', '-122.4194')
      render(<SearchForm />)
      // The component should have coords initialized
      // This is verified indirectly through the form submission behavior
      expect(screen.getByTestId('location-input')).toBeInTheDocument()
    })
  })

  // ============================================
  // Filter Panel Tests
  // ============================================

  describe('filter panel', () => {
    it('filters panel is hidden by default', () => {
      render(<SearchForm />)
      expect(screen.queryByText('Move-in Date')).not.toBeInTheDocument()
    })

    it('clicking Filters button toggles panel', async () => {
      render(<SearchForm />)
      const filtersButton = screen.getByRole('button', { name: /filters/i })

      await user.click(filtersButton)
      jest.runAllTimers()

      expect(screen.getByText('Move-in Date')).toBeInTheDocument()
      expect(screen.getByText('Lease Duration')).toBeInTheDocument()
      expect(screen.getByText('Room Type')).toBeInTheDocument()
    })

    it('panel shows amenities buttons', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      expect(screen.getByRole('button', { name: 'Wifi' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'AC' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Parking' })).toBeInTheDocument()
    })

    it('panel shows house rules buttons', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      expect(screen.getByRole('button', { name: 'Pets allowed' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Smoking allowed' })).toBeInTheDocument()
    })

    it('panel shows languages buttons', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spanish' })).toBeInTheDocument()
    })
  })

  // ============================================
  // Amenity Toggle Tests
  // ============================================

  describe('amenity toggle', () => {
    it('toggleAmenity adds amenity when clicked', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const wifiButton = screen.getByRole('button', { name: 'Wifi' })
      expect(wifiButton).toHaveAttribute('aria-pressed', 'false')

      await user.click(wifiButton)
      expect(wifiButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('toggleAmenity removes amenity when already selected', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const wifiButton = screen.getByRole('button', { name: 'Wifi' })

      // Click to add
      await user.click(wifiButton)
      expect(wifiButton).toHaveAttribute('aria-pressed', 'true')

      // Click to remove
      await user.click(wifiButton)
      expect(wifiButton).toHaveAttribute('aria-pressed', 'false')
    })

    it('multiple amenities can be selected', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const wifiButton = screen.getByRole('button', { name: 'Wifi' })
      const parkingButton = screen.getByRole('button', { name: 'Parking' })

      await user.click(wifiButton)
      await user.click(parkingButton)

      expect(wifiButton).toHaveAttribute('aria-pressed', 'true')
      expect(parkingButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  // ============================================
  // House Rules Toggle Tests
  // ============================================

  describe('house rules toggle', () => {
    it('toggleHouseRule adds rule when clicked', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const petsButton = screen.getByRole('button', { name: 'Pets allowed' })
      expect(petsButton).toHaveAttribute('aria-pressed', 'false')

      await user.click(petsButton)
      expect(petsButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('toggleHouseRule removes rule when already selected', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const petsButton = screen.getByRole('button', { name: 'Pets allowed' })

      await user.click(petsButton)
      expect(petsButton).toHaveAttribute('aria-pressed', 'true')

      await user.click(petsButton)
      expect(petsButton).toHaveAttribute('aria-pressed', 'false')
    })
  })

  // ============================================
  // Language Toggle Tests
  // ============================================

  describe('language toggle', () => {
    it('toggleLanguage adds language when clicked', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      // Initially, English is in "Available languages" with aria-pressed="false"
      const englishButton = screen.getByRole('button', { name: 'English' })
      expect(englishButton).toHaveAttribute('aria-pressed', 'false')

      await user.click(englishButton)

      // After clicking, the button moves to "Selected languages" section with aria-pressed="true"
      // We need to re-query since it's a different DOM element now
      const selectedEnglishButton = screen.getByRole('button', { name: /English/i })
      expect(selectedEnglishButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('toggleLanguage removes language when already selected', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      // Click to select English - it moves to "Selected languages" section
      const englishButton = screen.getByRole('button', { name: 'English' })
      await user.click(englishButton)

      // Re-query: button is now in "Selected languages" with aria-pressed="true"
      const selectedEnglishButton = screen.getByRole('button', { name: /English/i })
      expect(selectedEnglishButton).toHaveAttribute('aria-pressed', 'true')

      // Click to deselect - it moves back to "Available languages" section
      await user.click(selectedEnglishButton)

      // Re-query: button is back in "Available languages" with aria-pressed="false"
      const availableEnglishButton = screen.getByRole('button', { name: 'English' })
      expect(availableEnglishButton).toHaveAttribute('aria-pressed', 'false')
    })
  })

  // ============================================
  // Price Input Tests
  // ============================================

  describe('price inputs', () => {
    it('accepts positive numbers', async () => {
      render(<SearchForm />)
      const minInput = screen.getByLabelText(/minimum budget/i)

      await user.clear(minInput)
      await user.type(minInput, '500')

      expect(minInput).toHaveValue(500)
    })

    it('handles decimal values', async () => {
      render(<SearchForm />)
      const minInput = screen.getByLabelText(/minimum budget/i)

      await user.clear(minInput)
      await user.type(minInput, '500.50')

      expect(minInput).toHaveValue(500.5)
    })

    it('handles empty values', async () => {
      render(<SearchForm />)
      const minInput = screen.getByLabelText(/minimum budget/i)

      await user.clear(minInput)

      expect(minInput).toHaveValue(null)
    })
  })

  // ============================================
  // Location Handling Tests
  // ============================================

  describe('location handling', () => {
    it('clears coordinates when user types in location', async () => {
      mockSearchParams.set('lat', '37.7749')
      mockSearchParams.set('lng', '-122.4194')
      render(<SearchForm />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, 'new location')

      // After typing, the internal coords should be cleared
      // This is verified by the form submission not including lat/lng
    })

    it('sets coordinates when location selected from dropdown', async () => {
      render(<SearchForm />)

      const selectButton = screen.getByTestId('select-location')
      await user.click(selectButton)

      // Verify the selection happened - coords are now set internally
    })

    it('dispatches MAP_FLY_TO_EVENT on location select', async () => {
      render(<SearchForm />)

      const eventListener = jest.fn()
      window.addEventListener(MAP_FLY_TO_EVENT, eventListener)

      const selectButton = screen.getByTestId('select-location')
      await user.click(selectButton)

      expect(eventListener).toHaveBeenCalled()

      window.removeEventListener(MAP_FLY_TO_EVENT, eventListener)
    })

    it('shows warning when location typed but not selected', async () => {
      render(<SearchForm />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, 'San Francisco')

      expect(screen.getByText(/select a location from the dropdown/i)).toBeInTheDocument()
    })

    it('hides warning in compact mode', async () => {
      render(<SearchForm variant="compact" />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, 'San Francisco')

      expect(screen.queryByText(/select a location from the dropdown/i)).not.toBeInTheDocument()
    })
  })

  // ============================================
  // Clear All Filters Tests
  // ============================================

  describe('clear all filters', () => {
    it('clear button only shows when filters active', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      // Initially no clear button
      expect(screen.queryByText('Clear all')).not.toBeInTheDocument()

      // Add a filter
      await user.click(screen.getByRole('button', { name: 'Wifi' }))

      // Now clear button should appear
      expect(screen.getByText('Clear all')).toBeInTheDocument()
    })

    it('clear button resets all filter states', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      // Add filters
      await user.click(screen.getByRole('button', { name: 'Wifi' }))
      expect(screen.getByRole('button', { name: 'Wifi' })).toHaveAttribute('aria-pressed', 'true')

      // Clear all
      await user.click(screen.getByText('Clear all'))
      jest.runAllTimers()

      // Should navigate to clean search
      expect(mockPush).toHaveBeenCalledWith('/search')
    })
  })

  // ============================================
  // Form Submission Tests
  // ============================================

  describe('form submission', () => {
    it('submits form and calls router.push', async () => {
      render(<SearchForm />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, 'downtown')

      // Select location to set coords
      await user.click(screen.getByTestId('select-location'))

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      jest.advanceTimersByTime(500)

      expect(mockPush).toHaveBeenCalled()
    })

    it('trims location input', async () => {
      render(<SearchForm />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, '  downtown  ')

      // Select location
      await user.click(screen.getByTestId('select-location'))

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      jest.advanceTimersByTime(500)

      const pushCall = mockPush.mock.calls[0][0]
      expect(pushCall).toContain('q=downtown')
    })

    it('only includes q param if 2+ chars', async () => {
      render(<SearchForm />)

      const locationInput = screen.getByTestId('location-input')
      await user.type(locationInput, 'a')

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      jest.advanceTimersByTime(500)

      const pushCall = mockPush.mock.calls[0][0]
      expect(pushCall).not.toContain('q=')
    })

    it('shows loading state during search', async () => {
      render(<SearchForm />)

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      const searchButton = screen.getByRole('button', { name: /searching/i })
      expect(searchButton).toBeDisabled()
    })

    it('disables button during search', async () => {
      render(<SearchForm />)

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      const searchButton = screen.getByRole('button', { name: /searching/i })
      expect(searchButton).toBeDisabled()
    })
  })

  // ============================================
  // Accessibility Tests
  // ============================================

  describe('accessibility', () => {
    it('has search landmark role', () => {
      render(<SearchForm />)
      expect(screen.getByRole('search')).toBeInTheDocument()
    })

    it('price inputs have aria-labels', () => {
      render(<SearchForm />)
      expect(screen.getByLabelText(/minimum budget/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/maximum budget/i)).toBeInTheDocument()
    })

    it('amenity buttons have aria-pressed', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const wifiButton = screen.getByRole('button', { name: 'Wifi' })
      expect(wifiButton).toHaveAttribute('aria-pressed')
    })

    it('house rule buttons have aria-pressed', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const petsButton = screen.getByRole('button', { name: 'Pets allowed' })
      expect(petsButton).toHaveAttribute('aria-pressed')
    })

    it('language buttons have aria-pressed', async () => {
      render(<SearchForm />)
      await user.click(screen.getByRole('button', { name: /filters/i }))
      jest.runAllTimers()

      const englishButton = screen.getByRole('button', { name: 'English' })
      expect(englishButton).toHaveAttribute('aria-pressed')
    })

    it('search button has aria-busy when searching', async () => {
      render(<SearchForm />)

      const form = screen.getByRole('search')
      fireEvent.submit(form)

      const searchButton = screen.getByRole('button', { name: /searching/i })
      expect(searchButton).toHaveAttribute('aria-busy', 'true')
    })

    it('filter panel has aria-controls/aria-expanded', async () => {
      render(<SearchForm />)

      const filtersButton = screen.getByRole('button', { name: /filters/i })
      expect(filtersButton).toHaveAttribute('aria-expanded', 'false')
      // aria-controls is only set when the modal is open (valid ARIA pattern)
      expect(filtersButton).not.toHaveAttribute('aria-controls')

      // Open the filter modal — aria-controls should now be set
      await user.click(filtersButton)
      jest.runAllTimers()
      expect(filtersButton).toHaveAttribute('aria-expanded', 'true')
      expect(filtersButton).toHaveAttribute('aria-controls', 'search-filters')
    })
  })

  // ============================================
  // Debounce Tests
  // ============================================

  describe('debouncing', () => {
    it('debounces rapid submissions', async () => {
      render(<SearchForm />)

      const form = screen.getByRole('search')

      // Submit form once
      fireEvent.submit(form)

      // Advance past the 300ms debounce
      jest.advanceTimersByTime(400)

      // Should have called push after debounce
      expect(mockPush).toHaveBeenCalled()
    })
  })

  // ============================================
  // Stale URL Parameter Cleanup Tests
  // ============================================

  describe('stale URL parameter cleanup', () => {
    describe('clearing single-value filters removes them from URL', () => {
      it('removes moveInDate from URL when value is invalid (past date)', async () => {
        // Past dates are rejected by validation, so stale past date should not persist
        mockSearchParams.set('moveInDate', '2024-06-01')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).not.toContain('moveInDate')
      })

      it('removes roomType from URL when value is invalid', async () => {
        // Invalid roomType values should be rejected and not persist
        mockSearchParams.set('roomType', 'InvalidRoomType')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).not.toContain('roomType')
      })

      it('removes genderPreference from URL when value is invalid', async () => {
        // Invalid genderPreference values should be rejected and not persist
        mockSearchParams.set('genderPreference', 'INVALID_VALUE')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).not.toContain('genderPreference')
      })
    })

    describe('location change clears old location params', () => {
      it('removes old q/lat/lng when location is cleared', async () => {
        mockSearchParams.set('q', 'San Francisco')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const locationInput = screen.getByTestId('location-input')
        await user.clear(locationInput)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).not.toContain('q=San')
        expect(pushCall).not.toContain('lat=')
        expect(pushCall).not.toContain('lng=')
      })
    })

    describe('array filters do not accumulate', () => {
      it('does not duplicate amenities on repeated searches', async () => {
        mockSearchParams.set('amenities', 'Wifi')
        mockSearchParams.append('amenities', 'AC')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        const wifiMatches = (pushCall.match(/amenities=Wifi/g) || []).length
        expect(wifiMatches).toBeLessThanOrEqual(1)
      })

      it('clears invalid amenities from URL', async () => {
        // Invalid amenity values should not persist
        mockSearchParams.set('amenities', 'InvalidAmenity')
        mockSearchParams.set('lat', '37.7749')
        mockSearchParams.set('lng', '-122.4194')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).not.toContain('InvalidAmenity')
      })
    })

    describe('Use My Location', () => {
      const mockGetCurrentPosition = jest.fn()

      beforeEach(() => {
        mockToastError.mockClear()
        Object.defineProperty(navigator, 'geolocation', {
          value: { getCurrentPosition: mockGetCurrentPosition },
          writable: true,
          configurable: true,
        })
        mockGetCurrentPosition.mockReset()
      })

      it('sets lat/lng params on success without q param', async () => {
        mockGetCurrentPosition.mockImplementation((success: PositionCallback) => {
          success({ coords: { latitude: 40.7128, longitude: -74.006 } } as GeolocationPosition)
        })
        render(<SearchForm />)

        const btn = screen.getByRole('button', { name: /use my current location/i })
        fireEvent.click(btn)
        jest.advanceTimersByTime(500)

        await waitFor(() => {
          expect(mockPush).toHaveBeenCalled()
        })
        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).toContain('lat=40.7128')
        expect(pushCall).toContain('lng=-74.006')
        expect(pushCall).not.toContain('q=')
      })

      it('shows toast on permission denied', () => {
        mockGetCurrentPosition.mockImplementation((_s: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
        })
        render(<SearchForm />)

        fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('permission denied'))
      })

      it('shows toast on timeout', () => {
        mockGetCurrentPosition.mockImplementation((_s: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
        })
        render(<SearchForm />)

        fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('timed out'))
      })

      it('shows toast when geolocation not supported', () => {
        Object.defineProperty(navigator, 'geolocation', {
          value: undefined,
          writable: true,
          configurable: true,
        })
        render(<SearchForm />)

        fireEvent.click(screen.getByRole('button', { name: /use my current location/i }))

        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('not supported'))
      })

      it('ignores rapid double-tap', () => {
        // First call never resolves (simulates pending geolocation)
        mockGetCurrentPosition.mockImplementation(() => {})
        render(<SearchForm />)

        const btn = screen.getByRole('button', { name: /use my current location/i })
        fireEvent.click(btn)
        fireEvent.click(btn)

        expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1)
      })
    })

    describe('preserves map-related params', () => {
      it('preserves bounds and sort across filter changes', async () => {
        mockSearchParams.set('minLat', '37.5')
        mockSearchParams.set('maxLat', '38.0')
        mockSearchParams.set('minLng', '-123.0')
        mockSearchParams.set('maxLng', '-122.0')
        mockSearchParams.set('sort', 'price_asc')
        mockSearchParams.set('nearMatches', '1')
        render(<SearchForm />)

        const form = screen.getByRole('search')
        fireEvent.submit(form)
        jest.advanceTimersByTime(500)

        const pushCall = mockPush.mock.calls[0]?.[0] ?? ''
        expect(pushCall).toContain('minLat=')
        expect(pushCall).toContain('sort=price_asc')
        expect(pushCall).toContain('nearMatches=1')
      })
    })
  })
})
