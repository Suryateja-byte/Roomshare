import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import ReportList from "@/app/admin/reports/ReportList";

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

describe("Admin ReportList", () => {
  const reports = [
    {
      id: "report-abuse",
      kind: "ABUSE_REPORT" as const,
      reason: "spam",
      details: "Public abuse report details",
      status: "OPEN" as const,
      adminNotes: null,
      createdAt: new Date("2026-04-10T12:00:00.000Z"),
      resolvedAt: null,
      listing: {
        id: "listing-1",
        title: "Bright room",
        images: [],
        owner: {
          id: "owner-1",
          name: "Owner One",
          email: "owner1@example.com",
        },
      },
      reporter: {
        id: "reporter-1",
        name: "Reporter One",
        email: "reporter1@example.com",
      },
      reviewer: null,
    },
    {
      id: "report-private",
      kind: "PRIVATE_FEEDBACK" as const,
      reason: "general_concern",
      details: "Private feedback details",
      status: "OPEN" as const,
      adminNotes: null,
      createdAt: new Date("2026-04-11T12:00:00.000Z"),
      resolvedAt: null,
      listing: {
        id: "listing-2",
        title: "Quiet studio",
        images: [],
        owner: {
          id: "owner-2",
          name: "Owner Two",
          email: "owner2@example.com",
        },
      },
      reporter: {
        id: "reporter-2",
        name: "Reporter Two",
        email: "reporter2@example.com",
      },
      reviewer: null,
    },
  ];

  it("shows both report kinds by default and can isolate private feedback", () => {
    render(<ReportList initialReports={reports} totalReports={reports.length} />);

    expect(screen.getByText("Showing 2 of 2 reports")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abuse Report" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Private Feedback" })
    ).toBeInTheDocument();
    expect(screen.getByText("Public abuse report details")).toBeInTheDocument();
    expect(screen.getByText("Private feedback details")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Private Feedback" }));

    expect(screen.getByText("Showing 1 of 2 reports")).toBeInTheDocument();
    expect(screen.queryByText("Public abuse report details")).not.toBeInTheDocument();
    expect(screen.getByText("Private feedback details")).toBeInTheDocument();
  });
});
