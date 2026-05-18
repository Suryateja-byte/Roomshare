import { render, screen } from "@testing-library/react";
import Navbar from "@/components/Navbar";

const mockAuth = jest.fn();
const mockNavbarClient = jest.fn(
  ({ user, unreadCount }: { user: unknown; unreadCount: number }) => (
    <div
      data-testid="navbar-client"
      data-user={user ? "present" : "none"}
      data-unread-count={unreadCount}
    />
  )
);

jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

jest.mock("@/components/NavbarClient", () => ({
  __esModule: true,
  default: (props: { user: unknown; unreadCount: number }) =>
    mockNavbarClient(props),
}));

describe("Navbar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the public shell without calling server auth", () => {
    render(<Navbar />);

    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockNavbarClient).toHaveBeenCalledWith({
      user: null,
      unreadCount: 0,
    });
    expect(screen.getByTestId("navbar-client")).toHaveAttribute(
      "data-user",
      "none"
    );
  });
});
