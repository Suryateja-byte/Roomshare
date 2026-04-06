import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountNoticeHost from "@/components/AccountNoticeHost";
import { mockSession } from "@/__tests__/utils/mocks/session.mock";

const mockUseSession = jest.fn();
const mockUsePathname = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("AccountNoticeHost", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockUsePathname.mockReturnValue("/rooms");
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    });
  });

  it("renders the verification banner on non-search routes in the global host", async () => {
    render(<AccountNoticeHost placement="global" />);

    expect(
      await screen.findByTestId("email-verification-banner")
    ).toBeInTheDocument();
    expect(screen.getByTestId("account-notice-host-global")).toBeInTheDocument();
  });

  it("suppresses the global host on search routes", () => {
    mockUsePathname.mockReturnValue("/search");

    render(<AccountNoticeHost placement="global" />);

    expect(
      screen.queryByTestId("email-verification-banner")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("account-notice-host-global")
    ).not.toBeInTheDocument();
  });

  it("renders the verification banner inside the search host on /search", async () => {
    mockUsePathname.mockReturnValue("/search");

    render(<AccountNoticeHost placement="search" />);

    expect(
      await screen.findByTestId("email-verification-banner")
    ).toBeInTheDocument();
    expect(screen.getByTestId("account-notice-host-search")).toBeInTheDocument();
  });

  it("persists dismissal for the current session", async () => {
    mockUsePathname.mockReturnValue("/search");
    const user = userEvent.setup();

    const { unmount } = render(<AccountNoticeHost placement="search" />);

    await user.click(
      await screen.findByRole("button", {
        name: /dismiss verification reminder/i,
      })
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("email-verification-banner")
      ).not.toBeInTheDocument();
    });

    unmount();
    render(<AccountNoticeHost placement="search" />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("email-verification-banner")
      ).not.toBeInTheDocument();
    });
  });

  it("prioritizes suspension over email verification", async () => {
    mockUseSession.mockReturnValue({
      data: {
        ...mockSession,
        user: {
          ...mockSession.user,
          isSuspended: true,
        },
      },
      status: "authenticated",
      update: jest.fn(),
    });

    render(<AccountNoticeHost placement="global" />);

    expect(await screen.findByTestId("suspension-banner")).toBeInTheDocument();
    expect(
      screen.queryByTestId("email-verification-banner")
    ).not.toBeInTheDocument();
  });
});
