"use client";

interface SkipLinkProps {
  href?: string;
  children?: React.ReactNode;
}

export function SkipLink({
  href = "#main-content",
  children = "Skip to main content",
}: SkipLinkProps) {
  // The app scrolls inside CustomScrollContainer (window/body never scroll),
  // so native same-page anchor navigation can't move the viewport. Scroll the
  // target into view (scrollIntoView scrolls the nearest scrollable ancestor,
  // i.e. the custom container) and move focus manually.
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href.startsWith("#")) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView();
    target.focus({ preventScroll: true });
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2"
    >
      {children}
    </a>
  );
}
