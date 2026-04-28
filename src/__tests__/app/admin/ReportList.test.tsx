import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mockReportListProps = jest.fn();
const mockRedirect = jest.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});

jest.mock("@/app/admin/reports/ReportList", () => {
  const actual = jest.requireActual("@/app/admin/reports/ReportList");

  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockReportListProps(props);
      return actual.default(props);
    },
  };
});

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

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt = "", ...props }: { alt?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock("next/navigation", () => ({
  redirect: (destination: string) => mockRedirect(destination),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/app/actions/admin", () => ({
  requireAdmin: jest.fn(),
  resolveReport: jest.fn(),
  resolveReportAndRemoveListing: jest.fn(),
}));

jest.mock("@/components/UserAvatar", () => ({
  __esModule: true,
  default: ({ name }: { name?: string | null }) => (
    <div data-testid="user-avatar">{name ?? "Unknown"}</div>
  ),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    report: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import ReportList from "@/app/admin/reports/ReportList";
import AdminReportsPage from "@/app/admin/reports/page";
import {
  requireAdmin,
  resolveReport,
  resolveReportAndRemoveListing,
} from "@/app/actions/admin";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toast } from "sonner";

function createReport(id: string, kind: "ABUSE_REPORT" | "PRIVATE_FEEDBACK") {
  return {
    id,
    kind,
    reason: kind === "ABUSE_REPORT" ? "spam" : "general_concern",
    details:
      kind === "ABUSE_REPORT"
        ? `Abuse details ${id}`
        : `Private feedback details ${id}`,
    status: "OPEN" as const,
    adminNotes: null,
    createdAt: new Date("2026-04-11T12:00:00.000Z"),
    resolvedAt: null,
    listing: {
      id: `listing-${id}`,
      title: `Listing ${id}`,
      images: [],
      owner: {
        id: `owner-${id}`,
        name: `Owner ${id}`,
        email: `owner-${id}@example.com`,
      },
    },
    reporter: {
      id: `reporter-${id}`,
      name: `Reporter ${id}`,
      email: `reporter-${id}@example.com`,
    },
    reviewer: null,
  };
}

describe("Admin ReportList", () => {
  const reports = [
    createReport("abuse", "ABUSE_REPORT"),
    createReport("private", "PRIVATE_FEEDBACK"),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (resolveReport as jest.Mock).mockReset();
    (resolveReportAndRemoveListing as jest.Mock).mockReset();
  });

  it("shows server-provided reports and links filters through the URL", () => {
    render(
      <ReportList initialReports={reports} totalReports={reports.length} />
    );

    expect(screen.getByText("Showing 2 of 2 reports")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abuse Report" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Private Feedback" })
    ).toBeInTheDocument();
    expect(screen.getByText("Abuse details abuse")).toBeInTheDocument();
    expect(
      screen.getByText("Private feedback details private")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Private Feedback" })
    ).toHaveAttribute("href", "/admin/reports?kind=PRIVATE_FEEDBACK");
  });

  it("preserves active filters when building server-backed links", () => {
    render(
      <ReportList
        initialReports={[reports[1]]}
        totalReports={1}
        initialKindFilter="PRIVATE_FEEDBACK"
        initialStatusFilter="OPEN"
      />
    );

    expect(screen.getByText("Showing 1 of 1 reports")).toBeInTheDocument();
    expect(screen.queryByText("Abuse details abuse")).not.toBeInTheDocument();
    expect(
      screen.getByText("Private feedback details private")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolved" })).toHaveAttribute(
      "href",
      "/admin/reports?status=RESOLVED&kind=PRIVATE_FEEDBACK"
    );
  });

  it("resolves the intended report action on the first click", async () => {
    (resolveReport as jest.Mock).mockResolvedValue({ success: true });

    render(
      <ReportList initialReports={reports} totalReports={reports.length} />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Take Action" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mark Resolved" }));

    await waitFor(() => {
      expect(resolveReport).toHaveBeenCalledWith("abuse", "RESOLVED", "");
    });
    expect(resolveReportAndRemoveListing).not.toHaveBeenCalled();
  });

  it("does not reuse a previous action after an error", async () => {
    (resolveReport as jest.Mock)
      .mockResolvedValueOnce({ error: "Could not resolve report" })
      .mockResolvedValueOnce({ success: true });

    render(
      <ReportList initialReports={reports} totalReports={reports.length} />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Take Action" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mark Resolved" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not resolve report");
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Report" }));

    await waitFor(() => {
      expect(resolveReport).toHaveBeenLastCalledWith("abuse", "DISMISSED", "");
    });
    expect(resolveReport).toHaveBeenCalledTimes(2);
  });

  it("suppresses the listing on the first suppress click", async () => {
    (resolveReportAndRemoveListing as jest.Mock).mockResolvedValue({
      success: true,
    });

    render(
      <ReportList initialReports={reports} totalReports={reports.length} />
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Take Action" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Suppress Listing" }));

    await waitFor(() => {
      expect(resolveReportAndRemoveListing).toHaveBeenCalledWith("abuse", "");
    });
    expect(resolveReport).not.toHaveBeenCalled();
  });
});

describe("Admin reports page", () => {
  const allReports = [
    ...Array.from({ length: 200 }, (_, index) =>
      createReport(`abuse-${index + 1}`, "ABUSE_REPORT")
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      createReport(`private-${index + 1}`, "PRIVATE_FEEDBACK")
    ),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "admin-1" },
    });
    (requireAdmin as jest.Mock).mockResolvedValue({
      error: null,
      code: null,
      isAdmin: true,
      userId: "admin-1",
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.report.findMany as jest.Mock).mockImplementation(
      async ({
        where,
        skip = 0,
        take,
      }: {
        where?: { kind?: string; status?: string };
        skip?: number;
        take?: number;
      }) => {
        const filtered = allReports.filter((report) => {
          if (where?.kind && report.kind !== where.kind) {
            return false;
          }
          if (where?.status && report.status !== where.status) {
            return false;
          }
          return true;
        });
        return filtered.slice(skip, take ? skip + take : undefined);
      }
    );
    (prisma.report.count as jest.Mock).mockImplementation(
      async ({
        where,
      }: {
        where?: { kind?: string; status?: string };
      } = {}) =>
        allReports.filter((report) => {
          if (where?.kind && report.kind !== where.kind) {
            return false;
          }
          if (where?.status && report.status !== where.status) {
            return false;
          }
          return true;
        }).length
    );
  });

  it("filters PRIVATE_FEEDBACK rows on the server when ?kind=PRIVATE_FEEDBACK", async () => {
    render(
      await AdminReportsPage({
        searchParams: Promise.resolve({ kind: "PRIVATE_FEEDBACK" }),
      })
    );

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { kind: "PRIVATE_FEEDBACK" },
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKindFilter: "PRIVATE_FEEDBACK",
        initialReports: expect.arrayContaining([
          expect.objectContaining({ kind: "PRIVATE_FEEDBACK" }),
        ]),
        totalReports: 5,
        currentPage: 1,
        totalPages: 1,
      })
    );
    expect(screen.getByText("Showing 5 of 5 reports")).toBeInTheDocument();
  });

  it("returns all rows when no kind param is provided", async () => {
    render(
      await AdminReportsPage({
        searchParams: Promise.resolve({}),
      })
    );

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 0,
        take: 50,
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKindFilter: "all",
        totalReports: 205,
        totalPages: 5,
      })
    );
    expect(screen.getByText("Showing 50 of 205 reports")).toBeInTheDocument();
  });

  it("ignores invalid kind params and returns all rows", async () => {
    render(
      await AdminReportsPage({
        searchParams: Promise.resolve({ kind: "invalid" }),
      })
    );

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKindFilter: "all",
        totalReports: 205,
      })
    );
    expect(screen.getByText("Showing 50 of 205 reports")).toBeInTheDocument();
  });

  it("serves reports beyond the first 100 rows through page params", async () => {
    render(
      await AdminReportsPage({
        searchParams: Promise.resolve({ page: "3" }),
      })
    );

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 100,
        take: 50,
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        currentPage: 3,
        totalPages: 5,
        initialReports: expect.arrayContaining([
          expect.objectContaining({ id: "abuse-101" }),
        ]),
      })
    );
    expect(screen.getByText("Showing 50 of 205 reports")).toBeInTheDocument();
  });

  it("redirects non-admin users before rendering the page", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue({
      error: "Unauthorized",
      code: "NOT_ADMIN",
      isAdmin: false,
      userId: "user-1",
    });

    await expect(
      AdminReportsPage({
        searchParams: Promise.resolve({ kind: "PRIVATE_FEEDBACK" }),
      })
    ).rejects.toThrow("REDIRECT:/");
  });

  it("redirects suspended admin users before rendering report PII", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue({
      error: "Account suspended",
      code: "ACCOUNT_SUSPENDED",
      isAdmin: false,
      userId: "admin-1",
    });

    await expect(
      AdminReportsPage({
        searchParams: Promise.resolve({ kind: "PRIVATE_FEEDBACK" }),
      })
    ).rejects.toThrow("REDIRECT:/");
    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });
});
