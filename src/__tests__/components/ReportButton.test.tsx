import React from "react";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportButton from "@/components/ReportButton";

jest.mock("lucide-react", () => ({
  Flag: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="flag-icon" {...props} />
  ),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode; value: string }) => (
    <div>{children}</div>
  ),
}));

describe("ReportButton", () => {
  it("uses the same responsive trigger shell in SSR markup and hydrated render", () => {
    const serverMarkup = renderToStaticMarkup(
      <ReportButton listingId="listing-1" />
    );

    expect(serverMarkup).toContain('data-testid="report-listing"');
    expect(serverMarkup).toContain("w-11");
    expect(serverMarkup).toContain("md:w-auto");
    expect(serverMarkup).toContain('data-testid="report-listing-label"');
    expect(serverMarkup).toContain("hidden");
    expect(serverMarkup).toContain("md:inline");

    render(<ReportButton listingId="listing-1" />);

    const trigger = screen.getByTestId("report-listing");
    const label = screen.getByTestId("report-listing-label");

    expect(trigger).toHaveClass("w-11");
    expect(trigger).toHaveClass("md:w-auto");
    expect(trigger).toHaveClass("border");
    expect(trigger).toHaveAttribute("aria-label", "Report this listing");
    expect(label).toHaveClass("hidden");
    expect(label).toHaveClass("md:inline");
  });

  it("keeps the mobile trigger accessible while hiding the visible label below md", () => {
    render(<ReportButton listingId="listing-1" />);

    expect(
      screen.getByRole("button", { name: "Report this listing" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("flag-icon")).toBeInTheDocument();
    expect(screen.getByTestId("report-listing-label")).toHaveTextContent(
      "Report this listing"
    );
  });
});
