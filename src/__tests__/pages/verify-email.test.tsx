import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyEmailPage from "@/app/verify-email/page";

const mockUpdate = jest.fn();
let mockSearchParams = new URLSearchParams();
let mockSessionState: {
  data: { user?: { email?: string } } | null;
  status: "loading" | "authenticated" | "unauthenticated";
  update: typeof mockUpdate;
} = {
  data: null,
  status: "unauthenticated",
  update: mockUpdate,
};

jest.mock("next-auth/react", () => ({
  useSession: () => mockSessionState,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  };
});

describe("VerifyEmailPage", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockSessionState = {
      data: null,
      status: "unauthenticated",
      update: mockUpdate,
    };
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the confirm view for a valid token without mutating on load", () => {
    mockSearchParams = new URLSearchParams(`token=${"a".repeat(64)}`);

    render(<VerifyEmailPage />);

    expect(
      screen.getByRole("heading", { name: /Confirm your email/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Verify Email/i })
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders an invalid-link state when the token is missing", () => {
    render(<VerifyEmailPage />);

    expect(
      screen.getByRole("heading", { name: /Invalid verification link/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/missing a token/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Verify Email/i })
    ).not.toBeInTheDocument();
  });

  it("renders an invalid-link state for malformed tokens", () => {
    mockSearchParams = new URLSearchParams("token=not-a-real-token");

    render(<VerifyEmailPage />);

    expect(
      screen.getByRole("heading", { name: /Invalid verification link/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/invalid or malformed/i)).toBeInTheDocument();
  });

  it("verifies on click and refreshes the session for logged-in users", async () => {
    mockSearchParams = new URLSearchParams(`token=${"a".repeat(64)}`);
    mockSessionState = {
      data: { user: { email: "test@example.com" } },
      status: "authenticated",
      update: mockUpdate,
    };
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        status: "verified",
        message: "Your email address has been verified.",
      }),
    });

    render(<VerifyEmailPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /Verify Email/i })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "a".repeat(64) }),
      });
      expect(mockUpdate).toHaveBeenCalled();
    });

    expect(
      await screen.findByRole("heading", { name: /Email verified/i })
    ).toBeInTheDocument();
  });

  it("shows the expired-link recovery path after an expired response", async () => {
    mockSearchParams = new URLSearchParams(`token=${"a".repeat(64)}`);
    fetchMock.mockResolvedValue({
      status: 400,
      json: async () => ({
        status: "error",
        code: "expired_token",
        error:
          "This verification link has expired. Request a new one to continue.",
      }),
    });

    render(<VerifyEmailPage />);

    await userEvent.click(
      screen.getByRole("button", { name: /Verify Email/i })
    );

    expect(
      await screen.findByRole("heading", { name: /Verification link expired/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/has expired/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Request a new link/i).closest("a")
    ).toHaveAttribute("href", "/verify-expired");
  });
});
