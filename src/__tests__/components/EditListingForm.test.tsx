import React, { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditListingForm from "@/app/listings/[id]/edit/EditListingForm";

const mockRouter = {
  push: jest.fn(),
  refresh: jest.fn(),
};

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ListingFreshnessCheck", () => ({
  __esModule: true,
  default: () => <div data-testid="freshness-check" />,
}));

jest.mock("@/components/listings/ImageUploader", () => ({
  __esModule: true,
  default: ({
    initialImages = [],
    onImagesChange,
  }: {
    initialImages?: string[];
    onImagesChange?: (
      images: Array<{ id: string; previewUrl: string; uploadedUrl: string }>
    ) => void;
  }) => {
    useEffect(() => {
      onImagesChange?.(
        initialImages.map((url, index) => ({
          id: `initial-${index}`,
          previewUrl: url,
          uploadedUrl: url,
        }))
      );
    }, [initialImages, onImagesChange]);

    return (
      <div data-testid="image-uploader">
        <button
          type="button"
          onClick={() =>
            onImagesChange?.([
              {
                id: "uploaded-1",
                previewUrl: "https://supabase.example/storage/v1/object/public/images/listings/user/photo.jpg",
                uploadedUrl: "https://supabase.example/storage/v1/object/public/images/listings/user/photo.jpg",
              },
            ])
          }
        >
          Use uploaded photo
        </button>
        <button type="button" onClick={() => onImagesChange?.([])}>
          Remove all photos
        </button>
      </div>
    );
  },
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ version: 8 }),
  });
});

function buildListing(
  overrides: Partial<React.ComponentProps<typeof EditListingForm>["listing"]> = {}
) {
  return {
    id: "listing-123",
    title: "Sunny Mission Room",
    description: "A bright room close to transit.",
    price: 1200,
    amenities: ["Wifi", "Kitchen"],
    houseRules: ["No smoking"],
    householdLanguages: ["en"],
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    leaseDuration: "Month-to-month",
    roomType: "Private Room",
    bookingMode: "SHARED",
    version: 7,
    status: "ACTIVE" as const,
    statusReason: null,
    openSlots: 1,
    totalSlots: 2,
    moveInDate: "2026-08-01T00:00:00.000Z",
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: null,
    updatedAt: "2026-06-01T00:00:00.000Z",
    location: {
      address: "2400 Mission St",
      city: "San Francisco",
      state: "CA",
      zip: "94110",
    },
    images: ["https://example.com/listing-1.jpg"],
    ...overrides,
  };
}

describe("EditListingForm", () => {
  it("saves edited listing details with the hidden expectedVersion", async () => {
    const user = userEvent.setup();
    render(<EditListingForm listing={buildListing()} />);

    expect(screen.getByText("Listing details")).toBeInTheDocument();
    expect(screen.getByText("Availability & status")).toBeInTheDocument();
    expect(screen.queryByLabelText(/expected version/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/versioned availability contract/i)
    ).not.toBeInTheDocument();

    await user.clear(screen.getByTestId("listing-title-input"));
    await user.type(screen.getByTestId("listing-title-input"), "Updated Room");
    await user.clear(screen.getByTestId("listing-description-input"));
    await user.type(
      screen.getByTestId("listing-description-input"),
      "Updated description."
    );
    await user.clear(screen.getByTestId("listing-price-input"));
    await user.type(screen.getByTestId("listing-price-input"), "1350");
    await user.clear(screen.getByLabelText(/amenities/i));
    await user.type(screen.getByLabelText(/amenities/i), "Wifi, Parking");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("PATCH");
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      expectedVersion: 7,
      title: "Updated Room",
      description: "Updated description.",
      price: 1350,
      amenities: ["Wifi", "Parking"],
      address: "2400 Mission St",
      city: "San Francisco",
      state: "CA",
      zip: "94110",
      houseRules: [],
    });
    expect(payload).not.toHaveProperty("images");
    expect(payload).not.toHaveProperty("openSlots");
    expect(payload).not.toHaveProperty("status");
  });

  it("includes images only after the image list changes", async () => {
    const user = userEvent.setup();
    render(<EditListingForm listing={buildListing()} />);

    await user.click(screen.getByRole("button", { name: /use uploaded photo/i }));
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [, init] = mockFetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.images).toEqual([
      "https://supabase.example/storage/v1/object/public/images/listings/user/photo.jpg",
    ]);
  });

  it("keeps availability save on the host-managed payload", async () => {
    const user = userEvent.setup();
    render(<EditListingForm listing={buildListing()} />);

    await user.clear(screen.getByLabelText(/open slots/i));
    await user.type(screen.getByLabelText(/open slots/i), "2");
    await user.click(
      screen.getByRole("button", { name: /save availability/i })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("PATCH");
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      expectedVersion: 7,
      openSlots: 2,
      totalSlots: 2,
      moveInDate: "2026-08-01",
      availableUntil: null,
      minStayMonths: 1,
      status: "ACTIVE",
    });
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("images");
  });

  it("keeps unsaved availability edits after details save and uses the new version", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 8 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 9 }),
      });

    render(<EditListingForm listing={buildListing()} />);

    await user.clear(screen.getByLabelText(/open slots/i));
    await user.type(screen.getByLabelText(/open slots/i), "2");
    await user.clear(screen.getByTestId("listing-title-input"));
    await user.type(screen.getByTestId("listing-title-input"), "Updated Room");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/open slots/i)).toHaveValue(2);

    await user.click(
      screen.getByRole("button", { name: /save availability/i })
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const [, availabilityInit] = mockFetch.mock.calls[1];
    const availabilityPayload = JSON.parse(availabilityInit.body);
    expect(availabilityPayload).toMatchObject({
      expectedVersion: 8,
      openSlots: 2,
    });
  });

  it("stays on the page after availability save when details edits are unsaved", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 8 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 9 }),
      });

    render(<EditListingForm listing={buildListing()} />);

    await user.clear(screen.getByTestId("listing-title-input"));
    await user.type(screen.getByTestId("listing-title-input"), "Unsaved Room");
    await user.clear(screen.getByLabelText(/open slots/i));
    await user.type(screen.getByLabelText(/open slots/i), "2");
    await user.click(
      screen.getByRole("button", { name: /save availability/i })
    );

    expect(await screen.findByText(/availability saved/i)).toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("listing-title-input")).toHaveValue(
      "Unsaved Room"
    );

    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const [, detailsInit] = mockFetch.mock.calls[1];
    const detailsPayload = JSON.parse(detailsInit.body);
    expect(detailsPayload).toMatchObject({
      expectedVersion: 8,
      title: "Unsaved Room",
    });
  });

  it("saves text edits on a photo-less listing without requiring a photo", async () => {
    const user = userEvent.setup();
    render(<EditListingForm listing={buildListing({ images: [] })} />);

    const saveButton = screen.getByRole("button", { name: /save details/i });
    expect(saveButton).toBeEnabled();
    expect(
      screen.queryByText(/at least one photo is required/i)
    ).not.toBeInTheDocument();

    await user.clear(screen.getByTestId("listing-title-input"));
    await user.type(screen.getByTestId("listing-title-input"), "Fixed Title");
    await user.click(saveButton);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [, init] = mockFetch.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(payload.title).toBe("Fixed Title");
    expect(payload).not.toHaveProperty("images");
  });

  it("blocks saving details when photos are changed to zero", async () => {
    const user = userEvent.setup();
    render(<EditListingForm listing={buildListing()} />);

    await user.click(
      screen.getByRole("button", { name: /remove all photos/i })
    );

    expect(
      screen.getByText(/at least one photo is required/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save details/i })
    ).toBeDisabled();
  });

  it("surfaces a reload action when details save hits a version conflict", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        code: "VERSION_CONFLICT",
        error: "This listing changed while you were editing it.",
      }),
    });

    render(<EditListingForm listing={buildListing()} />);

    await user.click(screen.getByRole("button", { name: /save details/i }));

    expect(
      await screen.findByText(/updated elsewhere/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reload latest/i })
    ).toBeInTheDocument();
  });
});
