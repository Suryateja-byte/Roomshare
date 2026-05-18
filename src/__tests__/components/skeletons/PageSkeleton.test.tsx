import { render } from "@testing-library/react";
import { CardSkeleton, Skeleton } from "@/components/skeletons/Skeleton";
import {
  AdminTableSkeleton,
  ChatSkeleton,
  DashboardSkeleton,
  PageSkeleton,
} from "@/components/skeletons/PageSkeleton";

const dividerPattern =
  /\b(?:border-b|border-t|border-r|border-l|divide-|w-px|border border-outline-variant)\b/;

function expectNoDividerClasses(container: HTMLElement) {
  const classNames = Array.from(container.querySelectorAll("[class]")).map(
    (element) => element.getAttribute("class") ?? ""
  );

  expect(classNames.join(" ")).not.toMatch(dividerPattern);
}

describe("PageSkeleton loading surfaces", () => {
  it("keeps page loading semantics", () => {
    const { container } = render(<PageSkeleton />);
    const shell = container.querySelector('[aria-label="Loading page content"]');

    expect(shell).toHaveAttribute("aria-busy", "true");
  });

  it.each([
    ["page", <PageSkeleton key="page" />],
    ["dashboard", <DashboardSkeleton key="dashboard" />],
    ["chat", <ChatSkeleton key="chat" />],
    ["admin table", <AdminTableSkeleton key="admin-table" />],
    ["card helper", <CardSkeleton key="card" />],
  ])("does not render divider-heavy classes for %s skeletons", (_name, ui) => {
    const { container } = render(ui);

    expectNoDividerClasses(container);
  });
});

describe("Skeleton primitive", () => {
  it("preserves loading semantics on primitive blocks", () => {
    const { container } = render(<Skeleton />);
    const primitive = container.firstElementChild;

    expect(primitive).toHaveAttribute("aria-hidden", "true");
    expect(primitive).toHaveAttribute("aria-busy", "true");
    expect(primitive).toHaveAttribute("role", "presentation");
  });
});
