import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaveSearchButton from "@/components/SaveSearchButton";

const mockRouterPush = jest.fn();
const mockGetSession = jest.fn();
const mockRedirectToUrl = jest.fn();
let mockSessionStatus: "authenticated" | "loading" | "unauthenticated" =
  "authenticated";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  usePathname: () => "/search",
  useSearchParams: () =>
    new URLSearchParams("q=apartment&minPrice=500&maxPrice=1500"),
}));

jest.mock("next-auth/react", () => ({
  getSession: () => mockGetSession(),
  useSession: () => ({
    data:
      mockSessionStatus === "authenticated"
        ? { user: { id: "user-123" } }
        : null,
    status: mockSessionStatus,
  }),
}));

jest.mock("@/lib/client-redirect", () => ({
  redirectToUrl: (url: string) => mockRedirectToUrl(url),
}));

// Mock saveSearch
const mockSaveSearch = jest.fn();
jest.mock("@/app/actions/saved-search", () => ({
  saveSearch: (...args: any[]) => mockSaveSearch(...args),
}));

describe("SaveSearchButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionStatus = "authenticated";
    mockGetSession.mockResolvedValue(null);
    global.fetch = jest.fn();
  });

  it("renders save search button", () => {
    render(<SaveSearchButton />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("opens modal on click", async () => {
    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Save This Search")).toBeInTheDocument();
    expect(screen.getByText("Search Name")).toBeInTheDocument();
  });

  it("generates default name from filters", async () => {
    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("apartment - $500-$1500");
  });

  it("shows email alerts toggle", async () => {
    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Email Alerts")).toBeInTheDocument();
    expect(
      screen.getByText("Get notified when new listings match")
    ).toBeInTheDocument();
  });

  it("closes modal on cancel", async () => {
    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Save This Search")).not.toBeInTheDocument();
  });

  it("shows error for empty name", async () => {
    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Clear the input
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    expect(
      screen.getByText("Please enter a name for this search")
    ).toBeInTheDocument();
  });

  it("calls saveSearch on submit", async () => {
    mockSaveSearch.mockResolvedValue({ success: true, searchId: "search-123" });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveSearch).toHaveBeenCalledWith({
        name: "apartment - $500-$1500",
        filters: expect.objectContaining({
          query: "apartment",
          minPrice: 500,
          maxPrice: 1500,
        }),
        alertEnabled: true,
        alertFrequency: "DAILY",
      });
    });
  });

  it("shows loading state while saving", async () => {
    mockSaveSearch.mockImplementation(() => new Promise(() => {}));

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("shows error from API", async () => {
    mockSaveSearch.mockResolvedValue({
      error: "You can only save up to 10 searches",
    });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText("You can only save up to 10 searches")
      ).toBeInTheDocument();
    });
  });

  it("redirects unauthorized saves to login without showing raw Unauthorized", async () => {
    mockSaveSearch.mockResolvedValue({ error: "Unauthorized" });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockRedirectToUrl).toHaveBeenCalledWith(
        "/login?callbackUrl=%2Fsearch%3Fq%3Dapartment%26minPrice%3D500%26maxPrice%3D1500"
      );
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("redirects anonymous users to login before calling saveSearch", async () => {
    mockSessionStatus = "unauthenticated";

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    expect(mockSaveSearch).not.toHaveBeenCalled();
    expect(mockRedirectToUrl).toHaveBeenCalledWith(
      "/login?callbackUrl=%2Fsearch%3Fq%3Dapartment%26minPrice%3D500%26maxPrice%3D1500"
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("redirects loading anonymous sessions to login before calling saveSearch", async () => {
    mockSessionStatus = "loading";
    mockGetSession.mockResolvedValue(null);

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockRedirectToUrl).toHaveBeenCalledWith(
        "/login?callbackUrl=%2Fsearch%3Fq%3Dapartment%26minPrice%3D500%26maxPrice%3D1500"
      );
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockSaveSearch).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("saves after a loading session resolves to an authenticated user", async () => {
    mockSessionStatus = "loading";
    mockGetSession.mockResolvedValue({ user: { id: "user-123" } });
    mockSaveSearch.mockResolvedValue({ success: true, searchId: "search-123" });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveSearch).toHaveBeenCalledWith({
        name: "apartment - $500-$1500",
        filters: expect.objectContaining({
          query: "apartment",
          minPrice: 500,
          maxPrice: 1500,
        }),
        alertEnabled: true,
        alertFrequency: "DAILY",
      });
    });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockRedirectToUrl).not.toHaveBeenCalled();
  });

  it("handles exceptions", async () => {
    mockSaveSearch.mockRejectedValue(new Error("Network error"));

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  });

  it("closes modal on successful save", async () => {
    mockSaveSearch.mockResolvedValue({ success: true, searchId: "search-123" });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    // Use getAllByText and pick the button (last element)
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText("Save This Search")).not.toBeInTheDocument();
    });
  });

  it("shows unlock alerts affordance when alerts are saved but locked", async () => {
    mockSaveSearch.mockResolvedValue({
      success: true,
      searchId: "search-123",
      effectiveAlertState: "LOCKED",
    });

    render(<SaveSearchButton />);

    await userEvent.click(screen.getByRole("button"));
    const saveButtons = screen.getAllByText("Save Search");
    await userEvent.click(saveButtons[saveButtons.length - 1]);

    expect(
      await screen.findByText(
        "Search saved. Alerts are locked until you unlock Mover's Pass."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unlock Alerts" })
    ).toBeInTheDocument();
  });
});
