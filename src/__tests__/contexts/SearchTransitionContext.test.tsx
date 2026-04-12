import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SearchTransitionProvider,
  useSearchTransition,
  useSearchTransitionSafe,
} from "@/contexts/SearchTransitionContext";

// Mock useRouter
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
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
      <span data-testid="pending-reason">{context.pendingReason ?? "none"}</span>
      <button
        onClick={() =>
          context.navigateWithTransition("/test-url", {
            reason: "search-submit",
          })
        }
        data-testid="navigate-btn"
      >
        Navigate
      </button>
      <button
        onClick={() =>
          context.navigateWithTransition("/scroll-test", {
            scroll: true,
            reason: "filter",
          })
        }
        data-testid="navigate-scroll-btn"
      >
        Navigate with scroll
      </button>
      <button
        onClick={() =>
          context.replaceWithTransition("/replace-url", { reason: "map-pan" })
        }
        data-testid="replace-btn"
      >
        Replace
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
        </SearchTransitionProvider>
      );

      expect(screen.getByTestId("is-pending")).toHaveTextContent("false");
      expect(screen.getByTestId("pending-reason")).toHaveTextContent("none");
    });

    it("provides navigateWithTransition function", async () => {
      const user = userEvent.setup();
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>
      );

      await user.click(screen.getByTestId("navigate-btn"));

      // Should call router.push with scroll: false by default
      expect(mockPush).toHaveBeenCalledWith("/test-url", { scroll: false });
      expect(screen.getByTestId("pending-reason")).toHaveTextContent(
        "search-submit"
      );
    });

    it("respects scroll option when provided", async () => {
      const user = userEvent.setup();
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>
      );

      await user.click(screen.getByTestId("navigate-scroll-btn"));

      // Should call router.push with scroll: true when specified
      expect(mockPush).toHaveBeenCalledWith("/scroll-test", { scroll: true });
      expect(screen.getByTestId("pending-reason")).toHaveTextContent("filter");
    });

    it("provides replaceWithTransition and tracks map-pan reason", async () => {
      const user = userEvent.setup();
      render(
        <SearchTransitionProvider>
          <TestConsumer />
        </SearchTransitionProvider>
      );

      await user.click(screen.getByTestId("replace-btn"));

      expect(mockReplace).toHaveBeenCalledWith("/replace-url", {
        scroll: false,
      });
      expect(screen.getByTestId("pending-reason")).toHaveTextContent(
        "map-pan"
      );
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
        </SearchTransitionProvider>
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
        "useSearchTransition must be used within SearchTransitionProvider"
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
        </SearchTransitionProvider>
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
        </SearchTransitionProvider>
      );

      // isPending starts as false
      expect(capturedContext!.isPending).toBe(false);
    });
  });

  describe("retryLastNavigation", () => {
    it("is null before any navigation", () => {
      let capturedContext: ReturnType<typeof useSearchTransition> | null = null;

      render(
        <SearchTransitionProvider>
          <TestConsumer
            onRender={(ctx) => {
              capturedContext = ctx;
            }}
          />
        </SearchTransitionProvider>
      );

      // F9 FIX: retryLastNavigation is always a function (stable identity).
      // Consumers check isSlowTransition before showing retry UI.
      expect(capturedContext!.retryLastNavigation).toBeInstanceOf(Function);
    });

    it("is null when transition is not slow (even after navigation)", async () => {
      const user = userEvent.setup();
      let capturedContext: ReturnType<typeof useSearchTransition> | null = null;

      render(
        <SearchTransitionProvider>
          <TestConsumer
            onRender={(ctx) => {
              capturedContext = ctx;
            }}
          />
        </SearchTransitionProvider>
      );

      await user.click(screen.getByTestId("navigate-btn"));

      // F9 FIX: retryLastNavigation is always a function (stable identity).
      // Consumers check isSlowTransition before showing retry UI.
      expect(capturedContext!.retryLastNavigation).toBeInstanceOf(Function);
    });
  });
});
