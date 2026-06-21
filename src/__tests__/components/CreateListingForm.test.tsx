/**
 * Tests for CreateListingForm component
 */

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import CreateListingForm from "@/app/listings/create/CreateListingForm";
import { toast } from "sonner";
import { createListingClientSchema } from "@/lib/schemas";

// Mock dependencies
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/hooks/useFormPersistence", () => ({
  useFormPersistence: jest.fn(() => ({
    persistedData: null,
    hasDraft: false,
    savedAt: null,
    saveData: jest.fn(),
    cancelSave: jest.fn(),
    clearPersistedData: jest.fn(),
    isHydrated: true,
    crossTabConflict: false,
    dismissCrossTabConflict: jest.fn(),
  })),
  formatTimeSince: jest.fn(() => "2 minutes ago"),
}));

// Mock client-side Zod schema to not block submission in behavioral tests
jest.mock("@/lib/schemas", () => ({
  ...jest.requireActual("@/lib/schemas"),
  createListingSchema: {
    safeParse: jest.fn(() => ({ success: true, data: {} })),
  },
  createListingClientSchema: {
    safeParse: jest.fn(() => ({ success: true, data: {} })),
  },
}));

jest.mock("@/hooks/useNavigationGuard", () => ({
  useNavigationGuard: jest.fn().mockReturnValue({
    showDialog: false,
    message: "",
    onStay: jest.fn(),
    onLeave: jest.fn(),
    disable: jest.fn(),
  }),
}));

jest.mock("@/components/listings/ImageUploader", () => ({
  __esModule: true,
  default: ({
    onImagesChange,
  }: {
    onImagesChange: (images: any[]) => void;
  }) => (
    <div data-testid="image-uploader">
      <button
        type="button"
        data-testid="add-success-image"
        onClick={() =>
          onImagesChange([
            {
              id: "img-1",
              previewUrl: "test.jpg",
              uploadedUrl: "https://example.com/test.jpg",
              isUploading: false,
            },
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
            { id: "img-2", previewUrl: "uploading.jpg", isUploading: true },
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
            {
              id: "img-1",
              previewUrl: "test.jpg",
              uploadedUrl: "https://example.com/test.jpg",
              isUploading: false,
            },
            {
              id: "img-2",
              previewUrl: "failed.jpg",
              error: "Upload failed",
              isUploading: false,
            },
          ])
        }
      >
        Add Mixed
      </button>
    </div>
  ),
}));

jest.mock("@/components/listings/AddressAutocompleteInput", () => ({
  __esModule: true,
  default: ({
    id,
    name,
    value,
    onChange,
    disabled,
    ariaInvalid,
    ariaDescribedBy,
  }: {
    id?: string;
    name?: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaInvalid?: boolean;
    ariaDescribedBy?: string;
  }) => (
    <input
      id={id}
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  ),
}));

// Capture roomType onValueChange for auto-set tests
// We identify the roomType Select by inspecting its SelectContent children for "Entire Place"
let capturedRoomTypeOnValueChange: ((val: string) => void) | undefined;
const React = require("react");

function hasChildWithText(children: any, text: string): boolean {
  let found = false;
  React.Children.forEach(children, (child: any) => {
    if (found) return;
    if (typeof child === "string" && child.includes(text)) {
      found = true;
      return;
    }
    if (child?.props?.children) {
      found = hasChildWithText(child.props.children, text);
    }
    if (child?.props?.value === text) {
      found = true;
    }
  });
  return found;
}

jest.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: any) => {
    // Capture onValueChange for the Select whose children contain "Entire Place" (roomType)
    if (hasChildWithText(children, "Entire Place")) {
      capturedRoomTypeOnValueChange = onValueChange;
    }
    return <div data-testid="mock-select">{children}</div>;
  },
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
}));

import { useFormPersistence } from "@/hooks/useFormPersistence";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";

describe("CreateListingForm", () => {
  let fetchSpy: jest.SpyInstance;
  const mockCancelSave = jest.fn();
  const mockClearPersistedData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createListingClientSchema.safeParse as jest.Mock).mockReturnValue({
      success: true,
      data: {},
    });
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "listing-123" }),
    } as Response);
    (useFormPersistence as jest.Mock).mockReturnValue({
      persistedData: null,
      hasDraft: false,
      savedAt: null,
      saveData: jest.fn(),
      cancelSave: mockCancelSave,
      clearPersistedData: mockClearPersistedData,
      isHydrated: true,
      crossTabConflict: false,
      dismissCrossTabConflict: jest.fn(),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** Submit the form element directly (fireEvent.click on submit buttons
   *  does not reliably trigger form submission in JSDOM) */
  function submitForm() {
    fireEvent.submit(document.querySelector("form")!);
  }

  /** Fill all required fields so client-side Zod validation passes */
  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText(/listing title/i), {
      target: { value: "Test Listing" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "A great place to live with roommates nearby" },
    });
    fireEvent.change(screen.getByLabelText(/monthly rent/i), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText(/street address/i), {
      target: { value: "123 Main St" },
    });
    fireEvent.change(screen.getByLabelText(/city/i), {
      target: { value: "Austin" },
    });
    fireEvent.change(screen.getByLabelText(/state/i), {
      target: { value: "Texas" },
    });
    fireEvent.change(screen.getByLabelText(/zip code/i), {
      target: { value: "78701" },
    });
  }

  /** Add one successful image and submit the form */
  async function addImageAndSubmit() {
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("add-success-image"));
    await screen.findByRole("button", { name: /publish with 1 photo/i });
    submitForm();
  }

  describe("rendering", () => {
    it("displays form sections", () => {
      render(<CreateListingForm />);

      // There may be multiple elements (mobile/desktop), so we use getAllByText
      expect(screen.getAllByText("The Basics").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Location").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Photos").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Finer Details").length).toBeGreaterThan(0);
    });

    it("marks move-in date as required", () => {
      render(<CreateListingForm />);

      const moveInDateControl = document.getElementById("moveInDate");
      expect(screen.getByLabelText(/move-in date/i)).toBe(moveInDateControl);
      expect(moveInDateControl).not.toHaveAttribute("aria-required");
      expect(screen.getByText("When tenants can move in.")).toBeInTheDocument();
      expect(
        screen.queryByText("When can tenants move in? (Optional)")
      ).not.toBeInTheDocument();
    });

    it("shows progress indicator", () => {
      render(<CreateListingForm />);

      // A fresh form starts with no sections complete.
      expect(screen.getByText(/0\/4 complete/)).toBeInTheDocument();
    });

    it("displays form fields", () => {
      render(<CreateListingForm />);

      expect(screen.getByLabelText(/listing title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    });

    it("shows publish button", () => {
      render(<CreateListingForm />);

      expect(
        screen.getByRole("button", { name: /publish listing/i })
      ).toBeInTheDocument();
    });
  });

  describe("form validation", () => {
    it("shows publish button initially for forms without photos", () => {
      render(<CreateListingForm />);

      // The button should show "Publish Listing" when no photos are added
      expect(
        screen.getByRole("button", { name: /publish listing/i })
      ).toBeInTheDocument();
    });
  });

  describe("draft persistence", () => {
    it("shows draft banner when draft exists", () => {
      (useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: {
          title: "Saved Title",
          description: "Saved description",
        },
        hasDraft: true,
        savedAt: new Date(),
        saveData: jest.fn(),
        cancelSave: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
        crossTabConflict: false,
        dismissCrossTabConflict: jest.fn(),
      });

      render(<CreateListingForm />);

      expect(screen.getByText(/you have a saved draft/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /resume draft/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /start fresh/i })
      ).toBeInTheDocument();
    });

    it("clears draft on start fresh click", () => {
      const clearMock = jest.fn();
      (useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: { title: "Draft" },
        hasDraft: true,
        savedAt: new Date(),
        saveData: jest.fn(),
        cancelSave: jest.fn(),
        clearPersistedData: clearMock,
        isHydrated: true,
        crossTabConflict: false,
        dismissCrossTabConflict: jest.fn(),
      });

      render(<CreateListingForm />);

      const startFreshButton = screen.getByRole("button", {
        name: /start fresh/i,
      });
      fireEvent.click(startFreshButton);

      expect(clearMock).toHaveBeenCalled();
    });

    it("shows auto-save indicator when saved", () => {
      (useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: null,
        hasDraft: false,
        savedAt: new Date(),
        saveData: jest.fn(),
        cancelSave: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
        crossTabConflict: false,
        dismissCrossTabConflict: jest.fn(),
      });

      render(<CreateListingForm />);

      expect(screen.getByText(/draft saved/i)).toBeInTheDocument();
    });

    it("does not overwrite an unrestored draft when the user types before resuming", () => {
      const saveDataMock = jest.fn();
      (useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: {
          title: "Rich Draft",
          description: "Lots of carefully written detail",
          price: "2400",
        },
        hasDraft: true,
        savedAt: new Date(),
        saveData: saveDataMock,
        cancelSave: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
        crossTabConflict: false,
        dismissCrossTabConflict: jest.fn(),
      });

      render(<CreateListingForm />);

      // Draft banner is visible and the user has NOT clicked "Resume Draft".
      expect(screen.getByText(/you have a saved draft/i)).toBeInTheDocument();

      // Typing into a field before restoring must not trigger a save — doing so
      // would clobber the stored draft with near-empty current state.
      fireEvent.change(screen.getByLabelText(/listing title/i), {
        target: { value: "X" },
      });

      expect(saveDataMock).not.toHaveBeenCalled();
    });

    it("resumes autosaving once the draft has been restored", async () => {
      const saveDataMock = jest.fn();
      (useFormPersistence as jest.Mock).mockReturnValue({
        persistedData: {
          title: "Rich Draft",
          description: "Lots of detail",
          price: "2400",
          images: [],
        },
        hasDraft: true,
        savedAt: new Date(),
        saveData: saveDataMock,
        cancelSave: jest.fn(),
        clearPersistedData: jest.fn(),
        isHydrated: true,
        crossTabConflict: false,
        dismissCrossTabConflict: jest.fn(),
      });

      render(<CreateListingForm />);

      fireEvent.click(screen.getByRole("button", { name: /resume draft/i }));

      // After restore, the gate opens and the populated form persists again.
      await waitFor(() => expect(saveDataMock).toHaveBeenCalled());
    });
  });

  describe("image upload", () => {
    it("shows image uploader", () => {
      render(<CreateListingForm />);

      expect(screen.getByTestId("image-uploader")).toBeInTheDocument();
    });

    it("updates button text with photo count", async () => {
      render(<CreateListingForm />);

      const addImageButton = screen.getByText("Add Image");
      fireEvent.click(addImageButton);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /publish with 1 photo/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe("language selection", () => {
    it("displays language options", () => {
      render(<CreateListingForm />);

      expect(
        screen.getByRole("button", { name: "English" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Spanish" })
      ).toBeInTheDocument();
    });

    it("allows clicking on language buttons", () => {
      render(<CreateListingForm />);

      const englishButton = screen.getByRole("button", { name: "English" });

      // Simply verify the button can be clicked without error
      expect(() => fireEvent.click(englishButton)).not.toThrow();
    });
  });

  describe("accessibility", () => {
    it("has labels for form fields", () => {
      render(<CreateListingForm />);

      expect(screen.getByLabelText(/listing title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/monthly rent/i)).toBeInTheDocument();
    });

    it("marks required fields as required", () => {
      render(<CreateListingForm />);

      const titleInput = screen.getByLabelText(/listing title/i);
      expect(titleInput).toBeRequired();
    });
  });

  describe("form submission", () => {
    it("calls /api/listings with POST + JSON body", async () => {
      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/listings",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
            }),
            body: expect.any(String),
          })
        );
      });
    });

    it("omits bookingMode from the POST body when whole-unit mode is disabled", async () => {
      render(<CreateListingForm enableWholeUnitMode={false} />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      const [, options] = fetchSpy.mock.calls[0];
      expect(JSON.parse(options.body as string)).not.toHaveProperty(
        "bookingMode"
      );
    });

    it("includes X-Idempotency-Key header", async () => {
      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        const [, options] = fetchSpy.mock.calls[0];
        expect(options.headers["X-Idempotency-Key"]).toBeDefined();
      });
    });

    it("passes AbortController signal to fetch", async () => {
      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        const [, options] = fetchSpy.mock.calls[0];
        expect(options.signal).toBeInstanceOf(AbortSignal);
      });
    });

    it("shows success toast", async () => {
      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Listing published successfully!",
          expect.objectContaining({ duration: 5000 })
        );
      });
    });

    it("clears draft on success", async () => {
      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(mockCancelSave).toHaveBeenCalled();
        expect(mockClearPersistedData).toHaveBeenCalled();
      });
    });

    it("redirects after 1s delay", async () => {
      render(<CreateListingForm />);
      fillRequiredFields();
      fireEvent.click(screen.getByTestId("add-success-image"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });

      jest.useFakeTimers();

      await act(async () => {
        submitForm();
      });

      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(mockPush).toHaveBeenCalledWith("/listings/listing-123");
      jest.useRealTimers();
    });
  });

  describe("submission error handling", () => {
    it("displays server error message", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Bad request" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(screen.getByText("Bad request")).toBeInTheDocument();
      });
    });

    it("displays field-level validation errors", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            error: "Validation failed",
            fields: { title: "Title is required" },
          }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(screen.getByText("Title is required")).toBeInTheDocument();
      });
    });

    it("scrolls to top on error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Server error" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(window.scrollTo).toHaveBeenCalledWith({
          top: 0,
          behavior: "smooth",
        });
      });
    });

    it("displays max listings error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: "Maximum 10 active listings per user" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(
          screen.getByText("Maximum 10 active listings per user")
        ).toBeInTheDocument();
      });
    });

    it("displays geocoding failure error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Could not geocode address" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(
          screen.getByText("Could not geocode address")
        ).toBeInTheDocument();
      });
    });

    it("displays suspension error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: "Account suspended" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(screen.getByText("Account suspended")).toBeInTheDocument();
      });
    });

    it("displays email verification error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ error: "Please verify your email to continue" }),
      } as unknown as Response);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      expect(
        await screen.findByText("Please verify your email to continue")
      ).toBeInTheDocument();
    }, 10_000);

    it("silently handles AbortError", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      fetchSpy.mockRejectedValueOnce(abortError);

      render(<CreateListingForm />);
      await addImageAndSubmit();

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      // No error banner should appear for AbortError
      expect(screen.queryByTestId("form-error-banner")).not.toBeInTheDocument();
    });
  });

  describe("submission guards", () => {
    it("shows required field errors before the missing-photo banner", async () => {
      (createListingClientSchema.safeParse as jest.Mock).mockReturnValueOnce({
        success: false,
        error: {
          issues: [
            {
              path: ["title"],
              message: "Title is required",
            },
            {
              path: ["description"],
              message: "Description must be at least 10 characters",
            },
          ],
        },
      });

      render(<CreateListingForm />);

      submitForm();

      expect(await screen.findByText("Title is required")).toBeInTheDocument();
      expect(screen.getByLabelText(/listing title/i)).toHaveAttribute(
        "aria-invalid",
        "true"
      );
      expect(screen.queryByTestId("form-error-banner")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByLabelText(/listing title/i)).toHaveFocus();
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("blocks submit when no images", () => {
      render(<CreateListingForm />);

      submitForm();

      expect(screen.getByTestId("form-error-banner")).toHaveTextContent(
        /at least one photo/i
      );
    });

    it("blocks submit while uploading", async () => {
      const { container } = render(<CreateListingForm />);

      fireEvent.click(screen.getByTestId("add-uploading-image"));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /uploading images/i })
        ).toBeDisabled();
      });

      // Force submit to test the handler guard
      fireEvent.submit(container.querySelector("form")!);

      await waitFor(() => {
        expect(screen.getByText(/wait for all images/i)).toBeInTheDocument();
      });
    });

    it("blocks submit and shows inline error when move-in date is missing", async () => {
      (createListingClientSchema.safeParse as jest.Mock).mockReturnValueOnce({
        success: false,
        error: {
          issues: [
            {
              path: ["moveInDate"],
              message: "Move-in date is required",
            },
          ],
        },
      });

      render(<CreateListingForm />);
      fillRequiredFields();
      fireEvent.click(screen.getByTestId("add-success-image"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });

      submitForm();

      expect(
        await screen.findByText("Move-in date is required")
      ).toBeInTheDocument();
      expect(document.getElementById("moveInDate")).toHaveAttribute(
        "aria-invalid",
        "true"
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("prevents double submission", async () => {
      // Make fetch hang so isSubmittingRef stays locked
      fetchSpy.mockImplementationOnce(() => new Promise(() => {}));

      render(<CreateListingForm />);
      fillRequiredFields();
      fireEvent.click(screen.getByTestId("add-success-image"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });

      submitForm();
      submitForm();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("keeps publish disabled and ignores repeated submit after success", async () => {
      render(<CreateListingForm />);
      fillRequiredFields();
      fireEvent.click(screen.getByTestId("add-success-image"));
      const publishButton = await screen.findByRole("button", {
        name: /publish with 1 photo/i,
      });

      submitForm();

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Listing published successfully!",
          expect.any(Object)
        );
      });
      await waitFor(() => {
        expect(publishButton).toBeDisabled();
      });

      const [, firstOptions] = fetchSpy.mock.calls[0];
      const firstIdempotencyKey =
        firstOptions.headers["X-Idempotency-Key"];

      submitForm();
      fireEvent.click(publishButton);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(firstIdempotencyKey).toBeDefined();
      expect(fetchSpy.mock.calls[0][1].headers["X-Idempotency-Key"]).toBe(
        firstIdempotencyKey
      );
    });
  });

  describe("partial upload dialog", () => {
    it("shows dialog when images have mixed status", async () => {
      render(<CreateListingForm />);
      fillRequiredFields();

      fireEvent.click(screen.getByTestId("add-mixed-images"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });
      submitForm();

      await waitFor(() => {
        expect(
          screen.getByText(/some images failed to upload/i)
        ).toBeInTheDocument();
      });
    });

    it("confirms partial submit", async () => {
      render(<CreateListingForm />);
      fillRequiredFields();

      fireEvent.click(screen.getByTestId("add-mixed-images"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });
      submitForm();

      // Wait for dialog to appear
      const dialog = await screen.findByRole("alertdialog");
      const confirmBtn = within(dialog).getByRole("button", {
        name: /publish with 1 photo/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });
    });

    it("cancels without submitting", async () => {
      render(<CreateListingForm />);
      fillRequiredFields();

      fireEvent.click(screen.getByTestId("add-mixed-images"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });
      submitForm();

      // Wait for dialog to appear
      const dialog = await screen.findByRole("alertdialog");
      const cancelBtn = within(dialog).getByRole("button", {
        name: /go back to fix/i,
      });
      fireEvent.click(cancelBtn);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("navigation guard", () => {
    it("activates guard when form has content", async () => {
      render(<CreateListingForm />);

      const titleInput = screen.getByLabelText(/listing title/i);
      fireEvent.change(titleInput, { target: { value: "My Listing" } });

      await waitFor(() => {
        expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
          true,
          expect.stringContaining("unsaved")
        );
      });
    });

    it("guard inactive when form is empty", () => {
      render(<CreateListingForm />);

      expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
        false,
        expect.any(String)
      );
    });

    it("activates guard for detail-only fields the old predicate ignored (amenities)", async () => {
      render(<CreateListingForm />);

      // Amenities is a "Finer Details" field that the previous guard predicate
      // did not track — filling only it must still block navigation.
      fireEvent.change(screen.getByLabelText(/amenities/i), {
        target: { value: "Wifi, Gym" },
      });

      await waitFor(() => {
        expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
          true,
          expect.stringContaining("unsaved")
        );
      });
    });

    it("activates guard when only a language is selected", async () => {
      render(<CreateListingForm />);

      fireEvent.click(screen.getByRole("button", { name: "English" }));

      await waitFor(() => {
        expect(useNavigationGuard as jest.Mock).toHaveBeenLastCalledWith(
          true,
          expect.stringContaining("unsaved")
        );
      });
    });

    it("uses loading message during submission", async () => {
      // Make fetch hang so loading state persists
      fetchSpy.mockImplementationOnce(() => new Promise(() => {}));

      render(<CreateListingForm />);
      fillRequiredFields();
      fireEvent.click(screen.getByTestId("add-success-image"));
      await screen.findByRole("button", { name: /publish with 1 photo/i });

      await act(async () => {
        submitForm();
      });

      expect(useNavigationGuard as jest.Mock).toHaveBeenCalledWith(
        true,
        expect.stringContaining("still being created")
      );
    });
  });

  describe("accessibility", () => {
    it("associates the Photos and Languages sections with their group labels", () => {
      render(<CreateListingForm />);

      expect(
        screen.getByRole("group", { name: /upload photos/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: /languages spoken in the house/i })
      ).toBeInTheDocument();
    });

    it("marks required fields with a visible and sr-only required indicator", () => {
      render(<CreateListingForm />);

      // Native required attribute is set on the controls...
      expect(screen.getByLabelText(/listing title/i)).toBeRequired();
      expect(screen.getByLabelText(/monthly rent/i)).toBeRequired();
      expect(screen.getByLabelText(/total roommates/i)).toBeRequired();
      expect(screen.getByLabelText(/city/i)).toBeRequired();
      expect(screen.getByLabelText(/state/i)).toBeRequired();
      expect(screen.getByLabelText(/zip code/i)).toBeRequired();

      // ...and every required field exposes an sr-only " required" suffix
      // (title, description, price, totalSlots, address, city, state, zip,
      // moveInDate).
      expect(screen.getAllByText("required").length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("bookingMode auto-set", () => {
    beforeEach(() => {
      capturedRoomTypeOnValueChange = undefined;
    });

    it('auto-sets bookingMode to WHOLE_UNIT when user selects "Entire Place"', () => {
      render(<CreateListingForm enableWholeUnitMode={true} />);

      // Verify SHARED is initially selected
      const getBookingRadio = (value: string) =>
        screen
          .getAllByRole("radio")
          .find(
            (r) =>
              (r as HTMLInputElement).name === "bookingMode" &&
              (r as HTMLInputElement).value === value
          ) as HTMLInputElement;

      expect(getBookingRadio("SHARED").checked).toBe(true);

      // Simulate user changing roomType to "Entire Place"
      act(() => {
        capturedRoomTypeOnValueChange?.("Entire Place");
      });

      expect(getBookingRadio("WHOLE_UNIT").checked).toBe(true);
    });

    it('resets bookingMode to SHARED when user selects "Private Room"', () => {
      render(<CreateListingForm enableWholeUnitMode={true} />);

      const getBookingRadio = (value: string) =>
        screen
          .getAllByRole("radio")
          .find(
            (r) =>
              (r as HTMLInputElement).name === "bookingMode" &&
              (r as HTMLInputElement).value === value
          ) as HTMLInputElement;

      // Select Entire Place first
      act(() => {
        capturedRoomTypeOnValueChange?.("Entire Place");
      });
      expect(getBookingRadio("WHOLE_UNIT").checked).toBe(true);

      // Now select Private Room
      act(() => {
        capturedRoomTypeOnValueChange?.("Private Room");
      });
      expect(getBookingRadio("SHARED").checked).toBe(true);
    });

    it("allows user to override auto-set bookingMode", () => {
      render(<CreateListingForm enableWholeUnitMode={true} />);

      const getBookingRadio = (value: string) =>
        screen
          .getAllByRole("radio")
          .find(
            (r) =>
              (r as HTMLInputElement).name === "bookingMode" &&
              (r as HTMLInputElement).value === value
          ) as HTMLInputElement;

      // Auto-set to WHOLE_UNIT
      act(() => {
        capturedRoomTypeOnValueChange?.("Entire Place");
      });
      expect(getBookingRadio("WHOLE_UNIT").checked).toBe(true);

      // User manually clicks SHARED radio
      fireEvent.click(getBookingRadio("SHARED"));
      expect(getBookingRadio("SHARED").checked).toBe(true);
    });
  });
});
