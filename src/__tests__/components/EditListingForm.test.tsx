/**
 * Tests for EditListingForm bookingMode selector and auto-set behavior
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import EditListingForm from "@/app/listings/[id]/edit/EditListingForm";

// Mock dependencies
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/hooks/useFormPersistence", () => ({
  useFormPersistence: () => ({
    persistedData: null,
    hasDraft: false,
    savedAt: null,
    saveData: jest.fn(),
    cancelSave: jest.fn(),
    clearPersistedData: jest.fn(),
    isHydrated: true,
    crossTabConflict: false,
    dismissCrossTabConflict: jest.fn(),
  }),
  formatTimeSince: jest.fn(() => "2 minutes ago"),
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

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/components/listings/ImageUploader", () => ({
  __esModule: true,
  default: ({ onImagesChange }: { onImagesChange: (imgs: any[]) => void }) => (
    <div data-testid="mock-image-uploader">
      <button
        type="button"
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
    </div>
  ),
}));

// Capture roomType Select onValueChange for triggering changes in tests
let roomTypeOnValueChange: ((val: string) => void) | undefined;

jest.mock("@/components/ui/select", () => ({
  Select: ({ children, onValueChange, value }: any) => {
    // Capture onValueChange for roomType (identifiable by its values)
    if (
      typeof value === "string" &&
      ["Private Room", "Shared Room", "Entire Place", ""].includes(value)
    ) {
      roomTypeOnValueChange = onValueChange;
    }
    return <div data-testid="mock-select">{children}</div>;
  },
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <button onClick={() => roomTypeOnValueChange?.(value)}>{children}</button>
  ),
}));

// Mock fetch for PATCH
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ id: "listing-123" }),
}) as jest.Mock;

const defaultListing = {
  id: "listing-123",
  title: "Test Listing",
  description: "A great place to live",
  price: 1500,
  amenities: ["Wifi", "Gym"],
  houseRules: ["No smoking"],
  householdLanguages: ["en"],
  genderPreference: "NO_PREFERENCE",
  householdGender: "MIXED",
  leaseDuration: "1 year",
  roomType: "Private Room",
  bookingMode: "SHARED",
  totalSlots: 2,
  moveInDate: null,
  updatedAt: "2025-01-01T00:00:00.000Z",
  location: {
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
  },
  images: ["https://example.com/photo1.jpg"],
};

describe("EditListingForm — bookingMode", () => {
  beforeEach(() => {
    roomTypeOnValueChange = undefined;
    jest.clearAllMocks();
  });

  it("shows bookingMode selector when enableWholeUnitMode is true", () => {
    render(
      <EditListingForm listing={defaultListing} enableWholeUnitMode={true} />
    );

    expect(screen.getByText("Booking Mode")).toBeInTheDocument();
    // Radio buttons
    const radios = screen.getAllByRole("radio");
    const bookingRadios = radios.filter(
      (r) => (r as HTMLInputElement).name === "bookingMode"
    );
    expect(bookingRadios).toHaveLength(2);
  });

  it("hides bookingMode selector when enableWholeUnitMode is false", () => {
    render(
      <EditListingForm listing={defaultListing} enableWholeUnitMode={false} />
    );

    expect(screen.queryByText("Booking Mode")).not.toBeInTheDocument();
  });

  it("initializes bookingMode from listing data", () => {
    render(
      <EditListingForm
        listing={{ ...defaultListing, bookingMode: "WHOLE_UNIT" }}
        enableWholeUnitMode={true}
      />
    );

    const radios = screen.getAllByRole("radio");
    const wholeUnitRadio = radios.find(
      (r) =>
        (r as HTMLInputElement).name === "bookingMode" &&
        (r as HTMLInputElement).value === "WHOLE_UNIT"
    ) as HTMLInputElement;
    expect(wholeUnitRadio).toBeDefined();
    expect(wholeUnitRadio.checked).toBe(true);
  });

  it('auto-sets WHOLE_UNIT when user changes roomType to "Entire Place"', () => {
    render(
      <EditListingForm listing={defaultListing} enableWholeUnitMode={true} />
    );

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
      roomTypeOnValueChange?.("Entire Place");
    });

    // bookingMode should auto-set to WHOLE_UNIT
    expect(getBookingRadio("WHOLE_UNIT").checked).toBe(true);
  });

  it("does NOT auto-set bookingMode on initial load", () => {
    // Listing has roomType "Entire Place" but bookingMode "SHARED"
    // On load, auto-set should NOT fire
    render(
      <EditListingForm
        listing={{
          ...defaultListing,
          roomType: "Entire Place",
          bookingMode: "SHARED",
        }}
        enableWholeUnitMode={true}
      />
    );

    const getBookingRadio = (value: string) =>
      screen
        .getAllByRole("radio")
        .find(
          (r) =>
            (r as HTMLInputElement).name === "bookingMode" &&
            (r as HTMLInputElement).value === value
        ) as HTMLInputElement;

    // SHARED should still be selected (no auto-set on mount)
    expect(getBookingRadio("SHARED").checked).toBe(true);
  });
});
