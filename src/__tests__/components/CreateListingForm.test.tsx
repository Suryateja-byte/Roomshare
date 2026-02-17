/**
 * Tests for CreateListingForm component
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CreateListingForm from '@/app/listings/create/CreateListingForm'
import { toast } from 'sonner'

// Mock dependencies
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock('@/hooks/useFormPersistence', () => ({
  useFormPersistence: jest.fn(() => ({
    persistedData: null,
    hasDraft: false,
    savedAt: null,
    saveData: jest.fn(),
    clearPersistedData: jest.fn(),
    isHydrated: true,
  })),
  formatTimeSince: jest.fn(() => '2 minutes ago'),
}))

jest.mock('@/components/listings/ImageUploader', () => ({
  __esModule: true,
  default: ({ onImagesChange }: { onImagesChange: (images: any[]) => void }) => (
    <div data-testid="image-uploader">
      <button
        type="button"
        onClick={() =>
          onImagesChange([
            { id: 'img-1', previewUrl: 'test.jpg', uploadedUrl: 'https://example.com/test.jpg', isUploading: false },
          ])
        }
      >
        Add Image
      </button>
    </div>
  ),
}))

import { useFormPersistence } from '@/hooks/useFormPersistence'

describe('CreateListingForm', () => {
  let fetchSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'listing-123' }),
    } as Response)
    ;(useFormPersistence as jest.Mock).mockReturnValue({
      persistedData: null,
      hasDraft: false,
      savedAt: null,
      saveData: jest.fn(),
      clearPersistedData: jest.fn(),
      isHydrated: true,
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('rendering', () => {
    it('displays form sections', () => {
      render(<CreateListingForm />)

      // There may be multiple elements (mobile/desktop), so we use getAllByText
      expect(screen.getAllByText('The Basics').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Location').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Photos').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Finer Details').length).toBeGreaterThan(0)
    })

    it('shows progress indicator', () => {
      render(<CreateListingForm />)

      // Details section is always complete by default, so 1/4 is shown
      expect(screen.getByText(/1\/4 complete/)).toBeInTheDocument()
    })

    it('displays form fields', () => {
      render(<CreateListingForm />)

      expect(screen.getByLabelText(/listing title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument()
    })

    it('shows publish button', () => {
      render(<CreateListingForm />)

      expect(screen.getByRole('button', { name: /publish listing/i })).toBeInTheDocument()
    })
  })

  describe('form validation', () => {
    it('shows publish button initially for forms without photos', () => {
      render(<CreateListingForm />)

      // The button should show "Publish Listing" when no photos are added
      expect(screen.getByRole('button', { name: /publish listing/i })).toBeInTheDocument()
    })
  })

  describe('draft persistence', () => {
    it('shows draft banner when draft exists', () => {
      ;(useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: {
          title: 'Saved Title',
          description: 'Saved description',
        },
        hasDraft: true,
        savedAt: new Date(),
        saveData: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
      })

      render(<CreateListingForm />)

      expect(screen.getByText(/you have an unsaved draft/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /resume draft/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /start fresh/i })).toBeInTheDocument()
    })

    it('clears draft on start fresh click', () => {
      const clearMock = jest.fn()
      ;(useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: { title: 'Draft' },
        hasDraft: true,
        savedAt: new Date(),
        saveData: jest.fn(),
        clearPersistedData: clearMock,
        isHydrated: true,
      })

      render(<CreateListingForm />)

      const startFreshButton = screen.getByRole('button', { name: /start fresh/i })
      fireEvent.click(startFreshButton)

      expect(clearMock).toHaveBeenCalled()
    })

    it('shows auto-save indicator when saved', () => {
      ;(useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: null,
        hasDraft: false,
        savedAt: new Date(),
        saveData: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
      })

      render(<CreateListingForm />)

      expect(screen.getByText(/draft saved/i)).toBeInTheDocument()
    })
  })

  describe('image upload', () => {
    it('shows image uploader', () => {
      render(<CreateListingForm />)

      expect(screen.getByTestId('image-uploader')).toBeInTheDocument()
    })

    it('updates button text with photo count', async () => {
      render(<CreateListingForm />)

      const addImageButton = screen.getByText('Add Image')
      fireEvent.click(addImageButton)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /publish with 1 photo/i })).toBeInTheDocument()
      })
    })
  })

  describe('language selection', () => {
    it('displays language options', () => {
      render(<CreateListingForm />)

      expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spanish' })).toBeInTheDocument()
    })

    it('allows clicking on language buttons', () => {
      render(<CreateListingForm />)

      const englishButton = screen.getByRole('button', { name: 'English' })

      // Simply verify the button can be clicked without error
      expect(() => fireEvent.click(englishButton)).not.toThrow()
    })
  })

  describe('accessibility', () => {
    it('has labels for form fields', () => {
      render(<CreateListingForm />)

      expect(screen.getByLabelText(/listing title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument()
    })

    it('marks required fields as required', () => {
      render(<CreateListingForm />)

      const titleInput = screen.getByLabelText(/listing title/i)
      expect(titleInput).toBeRequired()
    })
  })
})
