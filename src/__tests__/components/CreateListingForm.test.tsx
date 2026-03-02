/**
 * Tests for CreateListingForm component
 */

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
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
    cancelSave: jest.fn(),
    clearPersistedData: jest.fn(),
    isHydrated: true,
  })),
  formatTimeSince: jest.fn(() => '2 minutes ago'),
}))

jest.mock('@/hooks/useNavigationGuard', () => ({
  useNavigationGuard: jest.fn(),
}))

jest.mock('@/components/listings/ImageUploader', () => ({
  __esModule: true,
  default: ({ onImagesChange }: { onImagesChange: (images: any[]) => void }) => (
    <div data-testid="image-uploader">
      <button
        type="button"
        data-testid="add-success-image"
        onClick={() =>
          onImagesChange([
            { id: 'img-1', previewUrl: 'test.jpg', uploadedUrl: 'https://example.com/test.jpg', isUploading: false },
          ])
        }
      >
        Add Image
      </button>
      <button
        type="button"
        data-testid="add-uploading-image"
        onClick={() =>
          onImagesChange([
            { id: 'img-2', previewUrl: 'uploading.jpg', isUploading: true },
          ])
        }
      >
        Add Uploading
      </button>
      <button
        type="button"
        data-testid="add-mixed-images"
        onClick={() =>
          onImagesChange([
            { id: 'img-1', previewUrl: 'test.jpg', uploadedUrl: 'https://example.com/test.jpg', isUploading: false },
            { id: 'img-2', previewUrl: 'failed.jpg', error: 'Upload failed', isUploading: false },
          ])
        }
      >
        Add Mixed
      </button>
    </div>
  ),
}))

import { useFormPersistence } from '@/hooks/useFormPersistence'
import { useNavigationGuard } from '@/hooks/useNavigationGuard'

describe('CreateListingForm', () => {
  let fetchSpy: jest.SpyInstance
  const mockCancelSave = jest.fn()
  const mockClearPersistedData = jest.fn()

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
      cancelSave: mockCancelSave,
      clearPersistedData: mockClearPersistedData,
      isHydrated: true,
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  /** Submit the form element directly (fireEvent.click on submit buttons
   *  does not reliably trigger form submission in JSDOM) */
  function submitForm() {
    fireEvent.submit(document.querySelector('form')!)
  }

  /** Add one successful image and submit the form */
  async function addImageAndSubmit() {
    fireEvent.click(screen.getByTestId('add-success-image'))
    await screen.findByRole('button', { name: /publish with 1 photo/i })
    submitForm()
  }

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

  describe('form submission', () => {
    it('calls /api/listings with POST + JSON body', async () => {
      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/listings',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: expect.any(String),
          })
        )
      })
    })

    it('includes X-Idempotency-Key header', async () => {
      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        const [, options] = fetchSpy.mock.calls[0]
        expect(options.headers['X-Idempotency-Key']).toBeDefined()
      })
    })

    it('passes AbortController signal to fetch', async () => {
      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        const [, options] = fetchSpy.mock.calls[0]
        expect(options.signal).toBeInstanceOf(AbortSignal)
      })
    })

    it('shows success toast', async () => {
      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          'Listing published successfully!',
          expect.objectContaining({ duration: 5000 })
        )
      })
    })

    it('clears draft on success', async () => {
      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(mockCancelSave).toHaveBeenCalled()
        expect(mockClearPersistedData).toHaveBeenCalled()
      })
    })

    it('redirects after 1s delay', async () => {
      render(<CreateListingForm />)
      fireEvent.click(screen.getByTestId('add-success-image'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })

      jest.useFakeTimers()

      await act(async () => {
        submitForm()
      })

      expect(toast.success).toHaveBeenCalled()
      expect(mockPush).not.toHaveBeenCalled()

      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(mockPush).toHaveBeenCalledWith('/listings/listing-123')
      jest.useRealTimers()
    })
  })

  describe('submission error handling', () => {
    it('displays server error message', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Bad request' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Bad request')).toBeInTheDocument()
      })
    })

    it('displays field-level validation errors', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: 'Validation failed',
          fields: { title: 'Title is required' },
        }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument()
      })
    })

    it('scrolls to top on error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      })
    })

    it('displays max listings error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Maximum 10 active listings per user' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Maximum 10 active listings per user')).toBeInTheDocument()
      })
    })

    it('displays geocoding failure error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Could not geocode address' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Could not geocode address')).toBeInTheDocument()
      })
    })

    it('displays suspension error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Account suspended' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Account suspended')).toBeInTheDocument()
      })
    })

    it('displays email verification error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Please verify your email to continue' }),
      } as unknown as Response)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(screen.getByText('Please verify your email to continue')).toBeInTheDocument()
      })
    })

    it('silently handles AbortError', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      fetchSpy.mockRejectedValueOnce(abortError)

      render(<CreateListingForm />)
      await addImageAndSubmit()

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled()
      })

      // No error banner should appear for AbortError
      expect(screen.queryByTestId('form-error-banner')).not.toBeInTheDocument()
    })
  })

  describe('submission guards', () => {
    it('blocks submit when no images', () => {
      render(<CreateListingForm />)

      submitForm()

      expect(screen.getByTestId('form-error-banner')).toHaveTextContent(/at least one photo/i)
    })

    it('blocks submit while uploading', async () => {
      const { container } = render(<CreateListingForm />)

      fireEvent.click(screen.getByTestId('add-uploading-image'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /uploading images/i })).toBeDisabled()
      })

      // Force submit to test the handler guard
      fireEvent.submit(container.querySelector('form')!)

      await waitFor(() => {
        expect(screen.getByText(/wait for all images/i)).toBeInTheDocument()
      })
    })

    it('prevents double submission', async () => {
      // Make fetch hang so isSubmittingRef stays locked
      fetchSpy.mockImplementationOnce(() => new Promise(() => {}))

      render(<CreateListingForm />)
      fireEvent.click(screen.getByTestId('add-success-image'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })

      submitForm()
      submitForm()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('partial upload dialog', () => {
    it('shows dialog when images have mixed status', async () => {
      render(<CreateListingForm />)

      fireEvent.click(screen.getByTestId('add-mixed-images'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })
      submitForm()

      await waitFor(() => {
        expect(screen.getByText(/some images failed to upload/i)).toBeInTheDocument()
      })
    })

    it('confirms partial submit', async () => {
      render(<CreateListingForm />)

      fireEvent.click(screen.getByTestId('add-mixed-images'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })
      submitForm()

      // Wait for dialog to appear
      const dialog = await screen.findByRole('alertdialog')
      const confirmBtn = within(dialog).getByRole('button', { name: /publish with 1 photo/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled()
      })
    })

    it('cancels without submitting', async () => {
      render(<CreateListingForm />)

      fireEvent.click(screen.getByTestId('add-mixed-images'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })
      submitForm()

      // Wait for dialog to appear
      const dialog = await screen.findByRole('alertdialog')
      const cancelBtn = within(dialog).getByRole('button', { name: /go back to fix/i })
      fireEvent.click(cancelBtn)

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('navigation guard', () => {
    it('activates guard when form has content', async () => {
      render(<CreateListingForm />)

      const titleInput = screen.getByLabelText(/listing title/i)
      fireEvent.change(titleInput, { target: { value: 'My Listing' } })

      await waitFor(() => {
        expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
          true,
          expect.stringContaining('unsaved')
        )
      })
    })

    it('guard inactive when form is empty', () => {
      render(<CreateListingForm />)

      expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
        false,
        expect.any(String)
      )
    })

    it('uses loading message during submission', async () => {
      // Make fetch hang so loading state persists
      fetchSpy.mockImplementationOnce(() => new Promise(() => {}))

      render(<CreateListingForm />)
      fireEvent.click(screen.getByTestId('add-success-image'))
      await screen.findByRole('button', { name: /publish with 1 photo/i })

      await act(async () => {
        submitForm()
      })

      expect(useNavigationGuard as jest.Mock).toHaveBeenCalledWith(
        true,
        expect.stringContaining('still being created')
      )
    })
  })
})
