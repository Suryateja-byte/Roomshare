import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock("@/app/actions/admin", () => ({
  toggleUserAdmin: jest.fn(),
  suspendUser: jest.fn(),
}));

jest.mock("@/components/UserAvatar", () => ({
  __esModule: true,
  default: ({ name }: { name?: string | null }) => (
    <div data-testid="user-avatar">{name ?? "Unknown"}</div>
  ),
}));

import { toggleUserAdmin, suspendUser } from "@/app/actions/admin";
import UserList from "@/app/admin/users/UserList";

type User = React.ComponentProps<typeof UserList>["initialUsers"][number];

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    name: "Admin One",
    email: "admin@example.com",
    image: null,
    isVerified: true,
    isAdmin: true,
    isSuspended: false,
    emailVerified: null,
    _count: {
      listings: 2,
      reviewsWritten: 3,
    },
    ...overrides,
  };
}

function renderUserList(
  overrides: Partial<React.ComponentProps<typeof UserList>> = {}
) {
  return render(
    <UserList
      initialUsers={[createUser()]}
      totalUsers={1}
      currentUserId="current-admin"
      searchQuery=""
      currentFilter="all"
      currentPage={1}
      totalPages={1}
      {...overrides}
    />
  );
}

describe("Admin UserList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("removes a row after admin status is removed in the admin filter", async () => {
    (toggleUserAdmin as jest.Mock).mockResolvedValue({
      success: true,
      isAdmin: false,
    });

    renderUserList({
      initialUsers: [createUser({ isAdmin: true })],
      currentFilter: "admin",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Admin One" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Admin" }));

    await waitFor(() => {
      expect(screen.queryByText("Admin One")).not.toBeInTheDocument();
    });
    expect(toggleUserAdmin).toHaveBeenCalledWith("user-1");
    expect(
      screen.getByText("No users found matching your criteria")
    ).toBeInTheDocument();
  });

  it("removes a row after unsuspending in the suspended filter", async () => {
    (suspendUser as jest.Mock).mockResolvedValue({ success: true });

    renderUserList({
      initialUsers: [createUser({ isSuspended: true })],
      currentFilter: "suspended",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Admin One" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Unsuspend User" }));

    await waitFor(() => {
      expect(screen.queryByText("Admin One")).not.toBeInTheDocument();
    });
    expect(suspendUser).toHaveBeenCalledWith("user-1", false);
    expect(
      screen.getByText("No users found matching your criteria")
    ).toBeInTheDocument();
  });

  it("keeps rows in the all filter while updating admin and suspended badges", async () => {
    (toggleUserAdmin as jest.Mock).mockResolvedValue({
      success: true,
      isAdmin: false,
    });
    (suspendUser as jest.Mock).mockResolvedValue({ success: true });

    renderUserList({
      initialUsers: [createUser({ isAdmin: true, isSuspended: false })],
      currentFilter: "all",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Admin One" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Admin" }));

    await waitFor(() => {
      expect(screen.getAllByText("Admin One").length).toBeGreaterThan(0);
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Admin One" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Suspend User" }));

    await waitFor(() => {
      expect(screen.getAllByText("Admin One").length).toBeGreaterThan(0);
      expect(screen.getByText("Suspended")).toBeInTheDocument();
    });
    expect(suspendUser).toHaveBeenCalledWith("user-1", true);
  });

  it("preserves search and filter params in generated links", () => {
    renderUserList({
      searchQuery: "alice",
      currentFilter: "admin",
      currentPage: 2,
      totalPages: 3,
    });

    expect(screen.getByRole("link", { name: "all" })).toHaveAttribute(
      "href",
      "/admin/users?q=alice"
    );
    expect(screen.getByRole("link", { name: "suspended" })).toHaveAttribute(
      "href",
      "/admin/users?q=alice&filter=suspended"
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/admin/users?q=alice&filter=admin"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/users?q=alice&filter=admin&page=3"
    );
  });
});
