import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactHostButton from "@/components/ContactHostButton";
import { toast } from "sonner";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock startConversation
const mockStartConversation = jest.fn();
jest.mock("@/app/actions/chat", () => ({
  startConversation: (...args: any[]) => mockStartConversation(...args),
}));

const mockRedirectToUrl = jest.fn();
jest.mock("@/lib/client-redirect", () => ({
  redirectToUrl: (...args: any[]) => mockRedirectToUrl(...args),
}));

// Mock sonner toast
jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe("ContactHostButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders contact host button", () => {
    render(<ContactHostButton listingId="listing-123" />);
    expect(screen.getByText("Contact Host")).toBeInTheDocument();
  });

  it("shows loading state when clicked", async () => {
    mockStartConversation.mockImplementation(() => new Promise(() => {}));

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    expect(screen.getByText("Starting Chat...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("redirects to login when unauthorized", async () => {
    mockStartConversation.mockResolvedValue({ error: "Unauthorized" });

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("shows toast error on other errors", async () => {
    mockStartConversation.mockResolvedValue({
      error: "Cannot chat with yourself",
    });

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Cannot chat with yourself");
    });
  });

  it("redirects to conversation on success", async () => {
    mockStartConversation.mockResolvedValue({ conversationId: "conv-123" });

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/messages/conv-123");
    });
  });

  it("handles exceptions", async () => {
    mockStartConversation.mockRejectedValue(new Error("Network error"));

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to start conversation");
    });
  });

  it("resets loading state after error", async () => {
    mockStartConversation.mockRejectedValue(new Error("Network error"));

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.click(screen.getByText("Contact Host"));

    await waitFor(() => {
      expect(screen.getByText("Contact Host")).toBeInTheDocument();
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });

  it("ignores rapid double clicks before loading state is painted", async () => {
    mockStartConversation.mockImplementation(() => new Promise(() => {}));

    render(<ContactHostButton listingId="listing-123" />);
    await userEvent.dblClick(screen.getByText("Contact Host"));

    expect(mockStartConversation).toHaveBeenCalledTimes(1);
  });

  it("renders unlock button when purchase is required", () => {
    render(
      <ContactHostButton
        listingId="listing-123"
        requiresUnlock
        paywallSummary={{
          requiresPurchase: true,
          offers: [
            {
              productCode: "CONTACT_PACK_3",
              label: "3 contacts",
              priceDisplay: "$4.99",
              description: "Unlock 3 additional message starts.",
            },
          ],
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Unlock to Contact" })
    ).toBeInTheDocument();
  });

  it("opens the paywall dialog instead of starting a conversation when locked", async () => {
    render(
      <ContactHostButton
        listingId="listing-123"
        requiresUnlock
        paywallSummary={{
          requiresPurchase: true,
          offers: [
            {
              productCode: "CONTACT_PACK_3",
              label: "3 contacts",
              priceDisplay: "$4.99",
              description: "Unlock 3 additional message starts.",
            },
          ],
        }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Unlock to Contact" }));

    expect(screen.getByTestId("contact-paywall-dialog")).toBeInTheDocument();
    expect(mockStartConversation).not.toHaveBeenCalled();
  });

  it("creates a checkout session and redirects to Stripe", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
        sessionId: "cs_test_123",
      }),
    });

    render(
      <ContactHostButton
        listingId="listing-123"
        requiresUnlock
        paywallSummary={{
          requiresPurchase: true,
          offers: [
            {
              productCode: "CONTACT_PACK_3",
              label: "3 contacts",
              priceDisplay: "$4.99",
              description: "Unlock 3 additional message starts.",
            },
          ],
        }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Unlock to Contact" }));
    await userEvent.click(screen.getByTestId("checkout-offer-CONTACT_PACK_3"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: "listing-123",
          productCode: "CONTACT_PACK_3",
        }),
      });
      expect(mockRedirectToUrl).toHaveBeenCalledWith(
        "https://checkout.stripe.com/pay/cs_test_123"
      );
    });
  });

  it("opens the paywall dialog when startConversation returns PAYWALL_REQUIRED", async () => {
    mockStartConversation.mockResolvedValue({
      error: "Unlock contact to message this host.",
      code: "PAYWALL_REQUIRED",
    });

    render(
      <ContactHostButton
        listingId="listing-123"
        paywallSummary={{
          requiresPurchase: true,
          offers: [
            {
              productCode: "CONTACT_PACK_3",
              label: "3 contacts",
              priceDisplay: "$4.99",
              description: "Unlock 3 additional message starts.",
            },
          ],
        }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Contact Host" }));

    expect(screen.getByTestId("contact-paywall-dialog")).toBeInTheDocument();
  });

  it("shows retry-later copy when startConversation returns PAYWALL_UNAVAILABLE", async () => {
    mockStartConversation.mockResolvedValue({
      error: "Contact is temporarily unavailable. Please try again shortly.",
      code: "PAYWALL_UNAVAILABLE",
    });

    render(<ContactHostButton listingId="listing-123" />);

    await userEvent.click(screen.getByRole("button", { name: "Contact Host" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Contact is temporarily unavailable. Please try again shortly."
      );
    });
  });
});
