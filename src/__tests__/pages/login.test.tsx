import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";

// Mock next-auth/react
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock next/link
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

describe("LoginPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders login form", () => {
    render(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders google sign in button", () => {
    render(<LoginPage />);

    expect(screen.getByText("Continue with Google")).toBeInTheDocument();
  });

  it("renders sign up link", () => {
    render(<LoginPage />);

    const signUpLink = screen.getByText("Sign up");
    expect(signUpLink.closest("a")).toHaveAttribute("href", "/signup");
  });

  it("renders forgot password link", () => {
    render(<LoginPage />);

    const forgotLink = screen.getByText("Forgot password?");
    expect(forgotLink.closest("a")).toHaveAttribute("href", "/forgot-password");
  });

  it("toggles password visibility", async () => {
    render(<LoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(
      screen.getByRole("button", { name: /show password/i })
    );
    expect(passwordInput).toHaveAttribute("type", "text");

    await userEvent.click(
      screen.getByRole("button", { name: /hide password/i })
    );
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("renders the registered banner when redirected from signup", () => {
    mockSearchParams = new URLSearchParams("registered=true");

    render(<LoginPage />);

    expect(
      screen.getByText("You're all set! Sign in to get started.")
    ).toBeInTheDocument();
  });

  it("calls signIn on form submit", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({
          email: "test@example.com",
          password: "password123",
          redirect: false,
        })
      );
    });
  });

  it("completes login successfully without error", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // Verify signIn was called and completed without error
      expect(mockSignIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({
          email: "test@example.com",
          password: "password123",
          redirect: false,
        })
      );
    });

    // Verify no error message is shown after successful login
    expect(
      screen.queryByText(
        "Incorrect email or password. Check your details and try again."
      )
    ).not.toBeInTheDocument();
  });

  it("shows error on failed login", async () => {
    mockSignIn.mockResolvedValue({ error: "Invalid credentials" });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Incorrect email or password. Check your details and try again."
        )
      ).toBeInTheDocument();
    });
  });

  it("calls Google signIn when clicking Google button", async () => {
    render(<LoginPage />);

    await userEvent.click(screen.getByText("Continue with Google"));

    expect(mockSignIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("shows loading state during login", async () => {
    mockSignIn.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Submit button should be disabled during loading
    const submitButton = screen.getByRole("button", { name: /signing in/i });
    expect(submitButton).toBeDisabled();
  });
});
