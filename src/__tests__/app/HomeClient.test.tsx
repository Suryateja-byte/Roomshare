import React from "react";
import { render, screen } from "@testing-library/react";
import HomeClient from "@/app/HomeClient";

const mockSearchForm = jest.fn(({ variant }: { variant?: string }) => (
  <div data-testid="search-form" data-variant={variant}>
    Search Form
  </div>
));

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: null,
    status: "unauthenticated",
  }),
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

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock("@/components/SearchForm", () => ({
  __esModule: true,
  default: (props: { variant?: string }) => mockSearchForm(props),
}));

jest.mock("@/components/home/EditorialLivingRoomHero", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <section data-testid="immersive-hero">{children}</section>
  ),
}));

jest.mock("framer-motion", () => {
  const React = require("react");

  const motionProxy = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        React.forwardRef(
          (
            { children, ...props }: { children?: React.ReactNode },
            ref: React.ForwardedRef<HTMLElement>
          ) => React.createElement(tag, { ref, ...props }, children)
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
  });

  it('passes the "home" variant to SearchForm', async () => {
    render(<HomeClient />);

    const searchForm = await screen.findByTestId("search-form");
    expect(searchForm).toHaveAttribute("data-variant", "home");
  });
});
