import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
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
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  });

  it("shows both report kinds by default and can isolate private feedback", () => {
    render(<ReportList initialReports={reports} totalReports={reports.length} />);

    expect(screen.getByText("Showing 2 of 2 reports")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abuse Report" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Private Feedback" })
    ).toBeInTheDocument();
    expect(screen.getByText("Abuse details abuse")).toBeInTheDocument();
    expect(screen.getByText("Private feedback details private")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Private Feedback" }));

    expect(screen.getByText("Showing 1 of 2 reports")).toBeInTheDocument();
    expect(screen.queryByText("Abuse details abuse")).not.toBeInTheDocument();
    expect(screen.getByText("Private feedback details private")).toBeInTheDocument();
  });

  it("seeds the client filter from the initial kind prop", () => {
    render(
      <ReportList
        initialReports={reports}
        totalReports={reports.length}
        initialKindFilter="PRIVATE_FEEDBACK"
      />
    );

    expect(screen.getByText("Showing 1 of 2 reports")).toBeInTheDocument();
    expect(screen.queryByText("Abuse details abuse")).not.toBeInTheDocument();
    expect(screen.getByText("Private feedback details private")).toBeInTheDocument();
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
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: true });
    (prisma.report.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where?: { kind?: string } }) =>
        where?.kind
          ? allReports.filter((report) => report.kind === where.kind)
          : allReports
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
        where: undefined,
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKindFilter: "all",
        totalReports: 205,
      })
    );
    expect(screen.getByText("Showing 205 of 205 reports")).toBeInTheDocument();
  });

  it("ignores invalid kind params and returns all rows", async () => {
    render(
      await AdminReportsPage({
        searchParams: Promise.resolve({ kind: "invalid" }),
      })
    );

    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
      })
    );
    expect(mockReportListProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialKindFilter: "all",
        totalReports: 205,
      })
    );
    expect(screen.getByText("Showing 205 of 205 reports")).toBeInTheDocument();
  });

  it("redirects non-admin users before rendering the page", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false });

    await expect(
      AdminReportsPage({
        searchParams: Promise.resolve({ kind: "PRIVATE_FEEDBACK" }),
      })
    ).rejects.toThrow("REDIRECT:/");
  });
});
