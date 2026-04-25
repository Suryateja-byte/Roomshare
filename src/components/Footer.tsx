import Image from "next/image";
import Link from "next/link";
import FooterNavLink from "./FooterNavLink";
import ComingSoonButton from "./ComingSoonButton";

const columns = [
  {
    label: "Platform",
    items: [
      { label: "Browse", href: "/search" },
      { label: "List a Room", href: "/listings/create" },
      { label: "Matching" },
      { label: "Cities" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Careers" },
      { label: "Blog" },
      { label: "Press" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Safety" },
      { label: "Help Center" },
      { label: "Contact" },
      { label: "Community" },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy" },
      { label: "Terms" },
      { label: "Accessibility" },
      { label: "Fair housing" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="overflow-hidden bg-surface-container-high pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-14 sm:pb-16 md:pb-12 md:pt-20">
      <div className="container">
        <div className="grid gap-10 pb-12 sm:grid-cols-2 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:gap-12 md:pb-16">
          <div className="sm:col-span-2 md:col-span-1">
            <Link
              href="/"
              className="mb-6 inline-flex items-center"
              aria-label="RoomShare home"
            >
              <Image
                src="/images/home/rs-logo.svg?v=2"
                alt=""
                width={138}
                height={30}
                className="h-8 w-auto"
              />
            </Link>
            <span className="block font-display text-xl font-semibold tracking-tight text-on-surface">
              RoomShare
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-on-surface-variant">
              Find your people, not just a place.
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-on-surface-variant">
              A slow, warm, verified way to find a home with people you will
              actually live with.
            </p>
            <div className="mt-7 flex gap-2">
              {["Instagram", "LinkedIn", "Substack"].map((label) => (
                <ComingSoonButton
                  key={label}
                  aria-label={`${label} (coming soon)`}
                  className="grid h-10 w-10 place-items-center rounded-full bg-surface-container-lowest text-xs font-bold uppercase tracking-[0.08em] text-on-surface shadow-ambient-sm transition-colors hover:text-primary"
                >
                  {label.slice(0, 1)}
                </ComingSoonButton>
              ))}
            </div>
          </div>

          {columns.map((column) => (
            <nav key={column.label} aria-label={column.label}>
              <h2 className="mb-5 font-body text-sm uppercase tracking-[0.12em] text-on-surface-variant">
                {column.label}
              </h2>
              <ul className="flex list-none flex-col gap-2 p-0 text-sm text-on-surface-variant">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.href ? (
                      <FooterNavLink
                        href={item.href}
                        className="inline-flex min-h-[44px] items-center transition-colors hover:text-primary"
                      >
                        {item.label}
                      </FooterNavLink>
                    ) : (
                      <ComingSoonButton className="inline-flex min-h-[44px] items-center text-left transition-colors hover:text-on-surface">
                        {item.label}
                      </ComingSoonButton>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="pt-8">
          <div className="font-display text-[clamp(5rem,19vw,16rem)] leading-[0.84] tracking-[-0.04em] text-on-surface">
            Roomshare<span className="italic text-primary">.</span>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-on-surface/10 pt-6 text-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} RoomShare Inc.</p>
            <p>ISSN 2026-0417</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
