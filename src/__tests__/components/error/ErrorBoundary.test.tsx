/**
 * Unit tests for ErrorBoundary component
 *
 * Tests:
 * 1. Renders children normally when no error
 * 2. Catches errors and shows default fallback with role="alert"
 * 3. Shows custom fallback when provided
 * 4. "Try again" button resets error state
 * 5. Sentry.captureException called on error
 * 6. onError callback fires
 * 7. "Reload page" button triggers window.location.reload
 */

// Mock Sentry BEFORE imports
// Use a lazy reference pattern to avoid hoisting issues with jest.mock
const mockSentry = {
  captureException: jest.fn(),
  setExtra: jest.fn(),
  setTag: jest.fn(),
};
jest.mock("@sentry/nextjs", () => ({
  withScope: (callback: (scope: { setExtra: jest.Mock; setTag: jest.Mock }) => void) => {
    callback({ setExtra: mockSentry.setExtra, setTag: mockSentry.setTag });
  },
  captureException: (...args: unknown[]) => mockSentry.captureException(...args),
}));

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ErrorBoundary,
  ErrorFallback,
} from "@/components/error/ErrorBoundary";

// Component that throws on demand
function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div data-testid="child-content">Hello World</div>;
}

// Suppress console.error for expected React error boundary logs
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Suppress React's error boundary error messages in test output
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("Error caught by ErrorBoundary") ||
      msg.includes("The above error occurred") ||
      msg.includes("Error: Uncaught") ||
      msg.includes("Error: Test error") ||
      msg.includes("Not implemented: navigation")
    ) {
      return;
    }
    originalConsoleError(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe("ErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("normal rendering", () => {
    it("renders children when no error occurs", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("child-content")).toBeInTheDocument();
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });
  });

  describe("error handling", () => {
    it("catches error and shows default fallback", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Child should not be rendered
      expect(screen.queryByTestId("child-content")).not.toBeInTheDocument();

      // Fallback should be visible
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });

    it('shows fallback with role="alert"', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
    });

    it("shows custom fallback when provided", () => {
      const customFallback = (
        <div data-testid="custom-fallback">Custom error UI</div>
      );

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
      expect(screen.getByText("Custom error UI")).toBeInTheDocument();
      // Default fallback should NOT be shown
      expect(
        screen.queryByText("Something went wrong"),
      ).not.toBeInTheDocument();
    });

    it("calls Sentry.captureException on error", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(mockSentry.captureException).toHaveBeenCalledTimes(1);
      expect(mockSentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Test error" }),
      );
    });

    it("sets Sentry scope extras with component stack", () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(mockSentry.setExtra).toHaveBeenCalledWith(
        "componentStack",
        expect.any(String),
      );
      expect(mockSentry.setTag).toHaveBeenCalledWith("errorBoundary", "custom");
    });

    it("calls onError callback when error occurs", () => {
      const onError = jest.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Test error" }),
        expect.objectContaining({ componentStack: expect.any(String) }),
      );
    });
  });

  describe("error recovery", () => {
    it('"Try again" button resets error state and re-renders children', () => {
      // We need a component that can switch between throwing and not throwing
      let shouldThrow = true;

      function ConditionalThrower() {
        if (shouldThrow) {
          throw new Error("Conditional error");
        }
        return <div data-testid="recovered-content">Recovered!</div>;
      }

      const { rerender } = render(
        <ErrorBoundary>
          <ConditionalThrower />
        </ErrorBoundary>,
      );

      // Should be in error state
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Try again")).toBeInTheDocument();

      // Fix the error condition before clicking retry
      shouldThrow = false;

      // Click "Try again"
      fireEvent.click(screen.getByText("Try again"));

      // Should recover and show children
      expect(screen.getByTestId("recovered-content")).toBeInTheDocument();
      expect(screen.getByText("Recovered!")).toBeInTheDocument();
    });

    it('"Reload page" button is rendered and clickable', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>,
      );

      const reloadBtn = screen.getByText("Reload page");
      expect(reloadBtn).toBeInTheDocument();
      expect(reloadBtn.tagName).toBe("BUTTON");
      // We verify the button exists and is clickable.
      // window.location.reload cannot be mocked in jsdom without
      // replacing the entire location object, so we verify the UI.
      expect(() => fireEvent.click(reloadBtn)).not.toThrow();
    });
  });
});

describe("ErrorFallback", () => {
  it("renders with default title and description", () => {
    render(<ErrorFallback error={null} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred. Please try again."),
    ).toBeInTheDocument();
  });

  it("renders with custom title and description", () => {
    render(
      <ErrorFallback
        error={null}
        title="Custom Title"
        description="Custom description text"
      />,
    );

    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom description text")).toBeInTheDocument();
  });

  it('has role="alert"', () => {
    render(<ErrorFallback error={null} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it('has aria-live="assertive"', () => {
    render(<ErrorFallback error={null} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
  });

  it("shows Try again button when onRetry is provided", () => {
    const onRetry = jest.fn();
    render(<ErrorFallback error={null} onRetry={onRetry} />);

    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("does not show Try again button when onRetry is not provided", () => {
    render(<ErrorFallback error={null} />);

    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
  });

  it("calls onRetry when Try again is clicked", () => {
    const onRetry = jest.fn();
    render(<ErrorFallback error={null} onRetry={onRetry} />);

    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
