import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SearchTransitionProvider,
  useSearchTransition,
  useSearchTransitionSafe,
} from "@/contexts/SearchTransitionContext";

// Mock useRouter
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Test component that uses the hook
function TestConsumer({
  onRender,
}: {
  onRender?: (ctx: ReturnType<typeof useSearchTransition>) => void;
}) {
  const context = useSearchTransition();
  onRender?.(context);
  return (
    <div>
      <span data-testid="is-pending">{String(context.isPending)}</span>
      <button
        onClick={() => context.navigateWithTransition("/test-url")}
        data-testid="navigate-btn"
      >
        Navigate
      </button>
      <button
        onClick={() =>
          context.navigateWithTransition("/scroll-test", { scroll: true })
        }
        data-testid="navigate-scroll-btn"
      >
        Navigate with scroll
      </button>
    </div>
  );
}

// Test component for safe hook
function SafeTestConsumer() {
  const context = useSearchTransitionSafe();
  return (
    <div>
      <span data-testid="has-context">{String(context !== null)}</span>
      {context && (
        <span data-testid="safe-pending">{String(context.isPending)}</span>
      )}
    </div>
  );
}

describe("SearchTransitionContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("SearchTransitionProvider", () => {
    it("provides isPending as false initially", () => {
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>,
      );

      expect(screen.getByTestId("is-pending")).toHaveTextContent("false");
    });

    it("provides navigateWithTransition function", async () => {
      const user = userEvent.setup();
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>,
      );

      await user.click(screen.getByTestId("navigate-btn"));

      // Should call router.push with scroll: false by default
      expect(mockPush).toHaveBeenCalledWith("/test-url", { scroll: false });
    });

    it("respects scroll option when provided", async () => {
      const user = userEvent.setup();
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>,
      );

      await user.click(screen.getByTestId("navigate-scroll-btn"));

      // Should call router.push with scroll: true when specified
      expect(mockPush).toHaveBeenCalledWith("/scroll-test", { scroll: true });
    });

    it("provides startTransition function", () => {
      let capturedContext: ReturnType<typeof useSearchTransition> | null = null;

      render(
        <SearchTransitionProvider>
          <TestConsumer
            onRender={(ctx) => {
              capturedContext = ctx;
            }}
          />
        </SearchTransitionProvider>,
      );

      expect(capturedContext).not.toBeNull();
      expect(typeof capturedContext!.startTransition).toBe("function");
    });
  });

  describe("useSearchTransition", () => {
    it("throws error when used outside provider", () => {
      // Suppress console.error for this test
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        render(<TestConsumer />);
      }).toThrow(
        "useSearchTransition must be used within SearchTransitionProvider",
      );

      consoleSpy.mockRestore();
    });
  });

  describe("useSearchTransitionSafe", () => {
    it("returns null when used outside provider", () => {
      render(<SafeTestConsumer />);

      expect(screen.getByTestId("has-context")).toHaveTextContent("false");
    });

    it("returns context when used inside provider", () => {
      render(
        <SearchTransitionProvider>
          <SafeTestConsumer />
        </SearchTransitionProvider>,
      );

      expect(screen.getByTestId("has-context")).toHaveTextContent("true");
      expect(screen.getByTestId("safe-pending")).toHaveTextContent("false");
    });
  });

  describe("isPending state", () => {
    it("is accessible through context", () => {
      let capturedContext: ReturnType<typeof useSearchTransition> | null = null;

      render(
        <SearchTransitionProvider>
          <TestConsumer
            onRender={(ctx) => {
              capturedContext = ctx;
            }}
          />
        </SearchTransitionProvider>,
      );

      // isPending starts as false
      expect(capturedContext!.isPending).toBe(false);
    });
  });
});
