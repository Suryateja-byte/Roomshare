import { render, screen } from "@testing-library/react";
import DesktopListingPreviewCard from "@/components/map/DesktopListingPreviewCard";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("DesktopListingPreviewCard", () => {
  it("uses the prebuilt detail href for the view details link", () => {
    render(
      <DesktopListingPreviewCard
        listing={{
          id: "listing-1",
          title: "Preview Listing",
          price: 1800,
          availableSlots: 1,
          images: ["https://example.com/listing-1.jpg"],
          avgRating: 4.9,
          reviewCount: 12,
          roomType: "private",
          location: {
            city: "San Francisco",
            state: "CA",
          },
        }}
        href="/listings/listing-1?startDate=2026-05-01&endDate=2026-06-01"
        isDarkMode={false}
        onClose={jest.fn()}
      />
    );

    expect(
      screen.getByRole("link", { name: /view details/i })
    ).toHaveAttribute(
      "href",
      "/listings/listing-1?startDate=2026-05-01&endDate=2026-06-01"
    );
  });

  it("exposes dialog semantics with an accessible name from the title", () => {
    render(
      <DesktopListingPreviewCard
        listing={{
          id: "listing-1",
          title: "Sunny Loft",
          price: 1800,
          availableSlots: 1,
          location: { city: "San Francisco", state: "CA" },
        }}
        href="/listings/listing-1"
        isDarkMode={false}
        onClose={jest.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Sunny Loft");

    // Accessible name is wired via aria-labelledby -> the heading id.
    const heading = screen.getByRole("heading", { name: "Sunny Loft" });
    expect(heading.id).toBe("map-popup-title-listing-1");
    expect(dialog).toHaveAttribute("aria-labelledby", heading.id);

    // Close control stays reachable for the focus trap.
    expect(
      screen.getByRole("button", { name: "Close listing preview" })
    ).toBeInTheDocument();
  });
});
