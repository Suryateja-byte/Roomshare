import React from "react";
import { render, screen } from "@testing-library/react";
import ReviewForm from "@/components/ReviewForm";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ReviewForm", () => {
  const renderReviewForm = (
    props: Partial<React.ComponentProps<typeof ReviewForm>> = {}
  ) =>
    render(
      <ReviewForm
        listingId="listing-123"
        isLoggedIn={true}
        hasExistingReview={false}
        hasBookingHistory={true}
        {...props}
      />
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render booking-request review gate phrases", () => {
    renderReviewForm({ hasBookingHistory: false });

    const forbiddenGateCopy = [
      /request\s+a\s+booking/i,
      /book\s+to\s+unlock\s+reviews/i,
      /reserve\s+now\s+to\s+review/i,
    ];

    forbiddenGateCopy.forEach((pattern) => {
      expect(document.body.textContent).not.toMatch(pattern);
    });
  });

  it("shows the confirmed-stay gate text when the viewer lacks an accepted booking", () => {
    renderReviewForm({ hasBookingHistory: false });

    expect(screen.getByText("Past stay required")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only past guests with a confirmed stay at this listing can leave a public review."
      )
    ).toBeInTheDocument();
  });

  it("shows the write form when the viewer has accepted booking history", () => {
    renderReviewForm();

    expect(
      screen.getByRole("button", { name: "Post Review" })
    ).toBeInTheDocument();
  });

  it("shows the sign-in CTA when the viewer is logged out", () => {
    renderReviewForm({ isLoggedIn: false });

    expect(
      screen.getByRole("link", { name: "Sign in to review" })
    ).toBeInTheDocument();
  });
});
