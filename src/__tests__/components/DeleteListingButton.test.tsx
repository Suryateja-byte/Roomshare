import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteListingButton from "@/components/DeleteListingButton";
import { toast } from "sonner";
import { hasPasswordSet } from "@/app/actions/settings";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch — save original and restore in afterAll to prevent cross-file leaks
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

// Mock sonner toast
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock server action
jest.mock("@/app/actions/settings", () => ({
  hasPasswordSet: jest.fn().mockResolvedValue(false),
}));

// Mock PasswordConfirmationModal to auto-confirm when opened
jest.mock("@/components/auth/PasswordConfirmationModal", () => ({
  PasswordConfirmationModal: ({
    isOpen,
    onConfirm,
    hasPassword,
  }: {
    isOpen: boolean;
    onConfirm: (password?: string) => void;
    hasPassword: boolean;
  }) => {
    if (isOpen) {
      // Simulate immediate confirmation when modal opens
      setTimeout(() => onConfirm(hasPassword ? "secret" : undefined), 0);
    }
    return null;
  },
}));

describe("DeleteListingButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasPasswordSet as jest.Mock).mockResolvedValue(false);
  });

  it("renders delete button", () => {
    render(<DeleteListingButton listingId="listing-123" />);
    expect(screen.getByText("Delete Listing")).toBeInTheDocument();
  });

  it("shows checking state on first click", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows confirmation dialog after can-delete check passes", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(
        screen.getByText("Are you sure? This action cannot be undone.")
      ).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
    });
  });

  it("hides confirmation on cancel", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Cancel"));

    expect(
      screen.queryByText("Are you sure? This action cannot be undone.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Delete Listing")).toBeInTheDocument();
  });

  it("calls delete API and redirects on success", async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });
    // Second call: actual delete
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<DeleteListingButton listingId="listing-123" />);

    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete Anyway"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/listings/listing-123", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(toast.success).toHaveBeenCalledWith(
        "Listing deleted successfully"
      );
      expect(mockPush).toHaveBeenCalledWith("/search");
    });
  });

  it("sends the confirmed password when deleting a password-backed listing", async () => {
    (hasPasswordSet as jest.Mock).mockResolvedValue(true);
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });
    // Second call: actual delete
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<DeleteListingButton listingId="listing-123" />);

    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete Anyway"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/api/listings/listing-123",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: "secret" }),
        }
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Listing deleted successfully"
      );
      expect(mockPush).toHaveBeenCalledWith("/search");
    });
  });

  it("shows error message on API failure", async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });
    // Second call: delete fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Cannot delete listing with active conversations",
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);

    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete Anyway"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Cannot delete listing with active conversations"
      );
    });
  });

  it("does not open confirmation when can-delete check fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Unauthorized",
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Unauthorized");
    });
    expect(
      screen.queryByText("Are you sure? This action cannot be undone.")
    ).not.toBeInTheDocument();
  });

  it("does not block deletion when there are no active conversations", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
      expect(
        screen.queryByText("This will affect active users")
      ).not.toBeInTheDocument();
    });
  });

  it("warns when active conversations will be removed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeConversations: 2,
      }),
    });

    render(<DeleteListingButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(
        screen.getByText("This will affect active users")
      ).toBeInTheDocument();
      expect(
        screen.getByText(/conversations will be deleted/)
      ).toBeInTheDocument();
    });
  });

  it("shows loading state while deleting", async () => {
    // First call: can-delete check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activeConversations: 0,
      }),
    });
    // Second call: delete (never resolves)
    mockFetch.mockImplementationOnce(() => new Promise(() => {}));

    render(<DeleteListingButton listingId="listing-123" />);

    await userEvent.click(screen.getByText("Delete Listing"));

    await waitFor(() => {
      expect(screen.getByText("Delete Anyway")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Delete Anyway"));

    expect(screen.getByText("Deleting...")).toBeInTheDocument();
  });
});
