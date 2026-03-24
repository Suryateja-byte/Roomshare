import Link from "next/link";
import FooterNavLink from "./FooterNavLink";
import ComingSoonButton from "./ComingSoonButton";

export default function Footer() {
  return (
    <footer className="bg-surface-container-lowest pt-24 pb-12 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-12 md:gap-16 mb-20">
          {/* Brand Section */}
          <div className="col-span-2 sm:col-span-3 md:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 mb-6 group"
            >
              <div className="w-8 h-8 bg-on-surface rounded-lg flex items-center justify-center text-white font-bold text-lg group-hover:scale-110 transition-transform shadow-lg shadow-on-surface/10">
                R
              </div>
              <span className="font-semibold text-lg tracking-[-0.03em] text-on-surface">
                RoomShare
                <span className="text-primary">.</span>
              </span>
            </Link>
            <p className="text-on-surface-variant text-sm font-light leading-relaxed max-w-xs">
              Find your people, not just a place.
            </p>
          </div>

          {/* Platform Links */}
          <nav aria-label="Platform">
            <h2 className="font-semibold text-on-surface mb-6 text-xs uppercase tracking-[0.2em]">
              Platform
            </h2>
            <ul className="flex flex-col gap-4 text-sm text-on-surface-variant font-light">
              <li>
                <FooterNavLink
                  href="/search"
                  className="hover:text-on-surface transition-colors"
                >
                  Browse
                </FooterNavLink>
              </li>
              <li>
                <FooterNavLink
                  href="/listings/create"
                  className="hover:text-on-surface transition-colors"
                >
                  List a Room
                </FooterNavLink>
              </li>
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Safety
                </ComingSoonButton>
              </li>
            </ul>
          </nav>

          {/* Company Links */}
          <nav aria-label="Company">
            <h2 className="font-semibold text-on-surface mb-6 text-xs uppercase tracking-[0.2em]">
              Company
            </h2>
            <ul className="flex flex-col gap-4 text-sm text-on-surface-variant font-light">
              <li>
                <FooterNavLink
                  href="/about"
                  className="hover:text-on-surface transition-colors"
                >
                  About
                </FooterNavLink>
              </li>
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Careers
                </ComingSoonButton>
              </li>
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Blog
                </ComingSoonButton>
              </li>
            </ul>
          </nav>

          {/* Support — no real links, only placeholders */}
          <nav aria-label="Support">
            <h2 className="font-semibold text-on-surface mb-6 text-xs uppercase tracking-[0.2em]">
              Support
            </h2>
            <ul className="flex flex-col gap-4 text-sm text-on-surface-variant font-light">
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Help Center
                </ComingSoonButton>
              </li>
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Contact
                </ComingSoonButton>
              </li>
            </ul>
          </nav>

          {/* Legal — no real links, only placeholders */}
          <nav aria-label="Legal">
            <h2 className="font-semibold text-on-surface mb-6 text-xs uppercase tracking-[0.2em]">
              Legal
            </h2>
            <ul className="flex flex-col gap-4 text-sm text-on-surface-variant font-light">
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Privacy
                </ComingSoonButton>
              </li>
              <li>
                <ComingSoonButton className="hover:text-on-surface transition-colors text-left">
                  Terms
                </ComingSoonButton>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom Bar */}
        <div className="pt-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] order-2 sm:order-1">
            © {new Date().getFullYear()} RoomShare Inc.
          </p>
          <div className="flex items-center gap-8 order-1 sm:order-2">
            <ComingSoonButton className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-[0.2em] transition-colors">
              Instagram
            </ComingSoonButton>
            <ComingSoonButton className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-[0.2em] transition-colors">
              X
            </ComingSoonButton>
            <ComingSoonButton className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface uppercase tracking-[0.2em] transition-colors">
              LinkedIn
            </ComingSoonButton>
          </div>
        </div>
      </div>
    </footer>
  );
}
