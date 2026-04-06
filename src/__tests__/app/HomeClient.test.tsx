import React from "react";
import { render, screen } from "@testing-library/react";
import HomeClient from "@/app/HomeClient";

const mockUseSession = jest.fn();

const mockSearchForm = jest.fn(({ variant }: { variant?: string }) => (
  <div data-testid="search-form" data-variant={variant}>
    Search Form
  </div>
));

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/SearchForm", () => ({
  __esModule: true,
  default: (props: { variant?: string }) => mockSearchForm(props),
}));

jest.mock("framer-motion", () => {
  const React = require("react");

  const motionProxy = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            {
              children,
              ...props
            }: {
              children?: React.ReactNode;
              [key: string]: unknown;
            },
            ref: React.ForwardedRef<HTMLElement>
          ) => {
            const {
              animate: _animate,
              initial: _initial,
              transition: _transition,
              variants: _variants,
              viewport: _viewport,
              whileInView: _whileInView,
              ...domProps
            } = props;

            return React.createElement(tag, { ref, ...domProps }, children);
          }
        ),
    }
  );

  return {
    LazyMotion: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    domAnimation: {},
    m: motionProxy,
  };
});

describe("HomeClient", () => {
  beforeEach(() => {
    mockSearchForm.mockClear();
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    });
  });

  it('passes the "home" variant to SearchForm', async () => {
    render(<HomeClient />);

    const searchForm = await screen.findByTestId("search-form");
    expect(searchForm).toHaveAttribute("data-variant", "home");
  });

  it("renders the heading and hero section", () => {
    render(<HomeClient />);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
