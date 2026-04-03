import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

type MockStateChangeListener = () => void;
type MockUpdateFoundListener = () => void;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    value,
  });
}

describe("ServiceWorkerRegistration", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalServiceWorker = navigator.serviceWorker;
  const originalCaches = window.caches;
  const originalReadyState = document.readyState;

  let stateChangeListener: MockStateChangeListener | null = null;
  let updateFoundListener: MockUpdateFoundListener | null = null;
  let mockWorker: { state: string; addEventListener: jest.Mock };
  let mockRegistration: {
    installing: typeof mockWorker | null;
    addEventListener: jest.Mock;
    update: jest.Mock;
  };
  let registerMock: jest.Mock;
  let getRegistrationsMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    stateChangeListener = null;
    updateFoundListener = null;

    mockWorker = {
      state: "installing",
      addEventListener: jest.fn(
        (event: string, listener: MockStateChangeListener) => {
          if (event === "statechange") {
            stateChangeListener = listener;
          }
        }
      ),
    };

    mockRegistration = {
      installing: mockWorker,
      addEventListener: jest.fn(
        (event: string, listener: MockUpdateFoundListener) => {
          if (event === "updatefound") {
            updateFoundListener = listener;
          }
        }
      ),
      update: jest.fn(),
    };

    registerMock = jest.fn().mockResolvedValue(mockRegistration);
    getRegistrationsMock = jest.fn().mockResolvedValue([]);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: { state: "activated" },
        register: registerMock,
        getRegistrations: getRegistrationsMock,
      },
    });

    Object.defineProperty(window, "caches", {
      configurable: true,
      value: {
        keys: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
    });

    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "complete",
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: originalCaches,
    });
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: originalReadyState,
    });
    setNodeEnv(originalNodeEnv);
  });

  it("registers the service worker in production without rendering update UI", async () => {
    setNodeEnv("production");

    const { container } = render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
    expect(
      screen.queryByText("A new version of the app is available.")
    ).not.toBeInTheDocument();
  });

  it("keeps updates silent while still notifying through onUpdate", async () => {
    setNodeEnv("production");
    const onUpdate = jest.fn();

    const { container } = render(
      <ServiceWorkerRegistration onUpdate={onUpdate} />
    );

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalled();
    });

    expect(updateFoundListener).not.toBeNull();
    updateFoundListener?.();

    mockWorker.state = "installed";
    stateChangeListener?.();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Update available")).not.toBeInTheDocument();
  });
});
