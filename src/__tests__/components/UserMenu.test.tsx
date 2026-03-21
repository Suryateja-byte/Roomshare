import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserMenu from "@/components/UserMenu";

// Mock next-auth/react
const mockSignOut = jest.fn();
jest.mock("next-auth/react", () => ({
  signOut: (...args: any[]) => mockSignOut(...args),
}));

// Mock next/link — forward all props to <a>
jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: any;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

describe("UserMenu", () => {
  const mockUser = {
    id: "user-123",
    name: "John Doe",
    email: "john@example.com",
    image: null,
    emailVerified: null as Date | null,
    isAdmin: false,
    isSuspended: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders user initial", () => {
    render(<UserMenu user={mockUser} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("renders user name on larger screens", () => {
    render(<UserMenu user={mockUser} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("opens menu on click", async () => {
    render(<UserMenu user={mockUser} />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByText("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("has correct ARIA attributes on trigger", () => {
    render(<UserMenu user={mockUser} />);
    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("sets aria-expanded when open", async () => {
    render(<UserMenu user={mockUser} />);
    const trigger = screen.getByRole("button");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes menu on Escape and returns focus to trigger", async () => {
    render(<UserMenu user={mockUser} />);
    const trigger = screen.getByRole("button");

    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("supports arrow key navigation between menu items", async () => {
    render(<UserMenu user={mockUser} />);
    await userEvent.click(screen.getByRole("button"));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
    expect(document.activeElement).toBe(items[0]);

    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);

    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("shows profile link", async () => {
    render(<UserMenu user={mockUser} />);

    await userEvent.click(screen.getByRole("button"));

    const profileLink = screen.getByText("Profile");
    expect(profileLink.closest("a")).toHaveAttribute("href", "/profile");
  });

  it("calls signOut when clicking sign out", async () => {
    render(<UserMenu user={mockUser} />);

    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByText("Sign out"));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("closes menu when clicking outside", async () => {
    render(<UserMenu user={mockUser} />);

    // Open menu
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("john@example.com")).toBeInTheDocument();

    // Click overlay
    const overlay = document.querySelector(".fixed.inset-0");
    if (overlay) {
      await userEvent.click(overlay);
    }

    // Menu should be closed (email no longer visible)
    expect(screen.queryByText("john@example.com")).not.toBeInTheDocument();
  });

  it("handles user without name", () => {
    const userWithoutName = { ...mockUser, name: undefined };
    render(<UserMenu user={userWithoutName} />);
    expect(screen.getByText("U")).toBeInTheDocument();
  });
});
