"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Shield,
  Lock,
  Eye,
  FileText,
  Mail,
  MapPin,
} from "lucide-react";

// --- Table of Contents Data ---
const SECTIONS = [
  { id: "introduction", label: "1. Introduction" },
  { id: "collection", label: "2. Information We Collect" },
  { id: "usage", label: "3. How We Use Data" },
  { id: "sharing", label: "4. Sharing & Disclosure" },
  { id: "third-party", label: "5. Third-Party Services" },
  { id: "security", label: "6. Data Security" },
  { id: "rights", label: "7. Your Rights" },
  { id: "contact", label: "8. Contact Us" },
];

export default function PrivacyClient() {
  const [activeSection, setActiveSection] = useState("introduction");

  // Simple scroll spy to highlight active section
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100;
      for (const section of SECTIONS) {
        const element = document.getElementById(section.id);
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(section.id);
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({ top: element.offsetTop - 100, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-svh bg-surface-canvas font-body text-on-surface selection:bg-on-surface selection:text-surface-container-lowest">
      {/* Hero */}
      <div className="pt-32 pb-16 px-6 bg-surface-canvas">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center justify-center p-3 bg-surface-container-lowest rounded-2xl shadow-ambient-sm mb-6">
            <Shield className="w-8 h-8 text-on-surface" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Privacy Policy
          </h1>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
            We believe in trust and transparency. This document outlines how we
            collect, use, and protect your personal data when you use RoomShare.
          </p>
          <p className="text-xs font-medium text-on-surface-variant mt-8 uppercase tracking-widest">
            Last Updated: December 14, 2025
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-6 py-16 flex flex-col lg:flex-row gap-16">
        {/* Sidebar Navigation (Sticky) */}
        <aside className="lg:w-64 flex-shrink-0 hidden lg:block">
          <div className="sticky top-32">
            <h2 className="font-bold text-sm text-on-surface mb-4 uppercase tracking-wider pl-4">
              Contents
            </h2>
            <nav className="space-y-1 border-l border-outline-variant/20">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollTo(section.id)}
                  className={`block w-full text-left px-4 py-2 text-sm transition-all border-l-2 -ml-[2px] ${
                    activeSection === section.id
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 max-w-3xl prose prose-zinc prose-lg">
          <section id="introduction" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-4 flex items-center gap-3">
              1. Introduction
            </h2>
            <p className="text-on-surface-variant leading-relaxed">
              Welcome to RoomShare. We respect your privacy and are committed to
              protecting your personal data. This privacy policy will inform you
              as to how we look after your personal data when you visit our
              website (regardless of where you visit it from) and tell you about
              your privacy rights and how the law protects you.
            </p>
          </section>

          <section id="collection" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-6 flex items-center gap-3">
              2. Information We Collect
            </h2>
            <div className="bg-surface-canvas rounded-lg p-8 space-y-6">
              <div className="flex gap-4">
                <div className="p-2 bg-surface-container-lowest rounded-lg h-fit">
                  <FileText className="w-5 h-5 text-on-surface-variant" />
                </div>
                <div>
                  <h3 className="font-semibold text-on-surface text-base mb-1">
                    Identity Data
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Includes first name, last name, username or similar
                    identifier, marital status, title, date of birth and gender.
                  </p>
                </div>
              </div>
              <div className="h-px bg-outline-variant/20 w-full"></div>
              <div className="flex gap-4">
                <div className="p-2 bg-surface-container-lowest rounded-lg h-fit">
                  <Mail className="w-5 h-5 text-on-surface-variant" />
                </div>
                <div>
                  <h3 className="font-semibold text-on-surface text-base mb-1">
                    Contact Data
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Includes billing address, delivery address, email address
                    and telephone numbers.
                  </p>
                </div>
              </div>
              <div className="h-px bg-outline-variant/20 w-full"></div>
              <div className="flex gap-4">
                <div className="p-2 bg-surface-container-lowest rounded-lg h-fit">
                  <Eye className="w-5 h-5 text-on-surface-variant" />
                </div>
                <div>
                  <h3 className="font-semibold text-on-surface text-base mb-1">
                    Usage Data
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Includes information about how you use our website, products
                    and services.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="usage" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-4">
              3. How We Use Your Data
            </h2>
            <p className="text-on-surface-variant mb-4 leading-relaxed">
              We will only use your personal data when the law allows us to.
              Most commonly, we will use your personal data in the following
              circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-on-surface-variant marker:text-on-surface-variant/30">
              <li>
                Where we need to perform the contract we are about to enter into
                or have entered into with you.
              </li>
              <li>
                Where it is necessary for our legitimate interests (or those of
                a third party) and your interests and fundamental rights do not
                override those interests.
              </li>
              <li>
                Where we need to comply with a legal or regulatory obligation.
              </li>
            </ul>
          </section>

          <section id="sharing" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-4">
              4. Sharing & Disclosure
            </h2>
            <p className="text-on-surface-variant leading-relaxed">
              We do not sell your personal data. We may share your data with
              third parties who provide services on our behalf to help with our
              business activities. These companies are authorized to use your
              personal information only as necessary to provide these services
              to us.
            </p>
          </section>

          <section id="third-party" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-6 flex items-center gap-3">
              <MapPin className="w-6 h-6 text-on-surface-variant" /> 5.
              Third-Party Services
            </h2>
            <div className="bg-surface-canvas rounded-lg p-8">
              <h3 className="font-semibold text-on-surface text-base mb-3">
                Google Maps Platform
              </h3>
              <p className="text-on-surface-variant leading-relaxed mb-4">
                Our neighborhood exploration feature uses the Google Maps
                Platform to help you discover nearby places such as restaurants,
                gyms, and transit stations. When you use this feature:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-on-surface-variant marker:text-on-surface-variant/30 mb-4">
                <li>
                  Your approximate location (derived from the listing
                  you&apos;re viewing) is sent to Google to retrieve nearby
                  place information.
                </li>
                <li>
                  Google may collect usage data in accordance with their privacy
                  practices.
                </li>
                <li>
                  We do not store or cache place data beyond your current
                  session.
                </li>
                <li>
                  No coordinate data is extracted or used for any purpose other
                  than displaying nearby places.
                </li>
              </ul>
              <p className="text-on-surface-variant leading-relaxed">
                By using this feature, you also agree to Google&apos;s{" "}
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Terms of Service
                </a>{" "}
                and{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </section>

          <section id="security" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-4 flex items-center gap-2">
              <Lock className="w-6 h-6 text-on-surface-variant" /> 6. Data
              Security
            </h2>
            <p className="text-on-surface-variant leading-relaxed">
              We have put in place appropriate security measures to prevent your
              personal data from being accidentally lost, used or accessed in an
              unauthorized way, altered or disclosed. In addition, we limit
              access to your personal data to those employees, agents,
              contractors and other third parties who have a business need to
              know.
            </p>
          </section>

          <section id="rights" className="mb-16 scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-4">
              7. Your Rights
            </h2>
            <p className="text-on-surface-variant mb-6 leading-relaxed">
              Under certain circumstances, you have rights under data protection
              laws in relation to your personal data, including the right to
              request access, correction, erasure, restriction, transfer, to
              object to processing, to portability of data and (where the lawful
              ground of processing is consent) to withdraw consent.
            </p>
          </section>

          <section id="contact" className="scroll-mt-32">
            <h2 className="font-display text-2xl font-bold text-on-surface mb-6">
              8. Contact Us
            </h2>
            <div className="bg-primary text-white rounded-lg p-8 md:p-10 relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-display text-xl font-bold mb-2">
                  Have questions?
                </h3>
                <p className="text-white/60 mb-6">
                  Our Data Protection Officer is available to help.
                </p>
                <a
                  href="mailto:privacy@roomshare.com"
                  className="inline-flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-full font-bold text-sm hover:bg-white/90 transition-colors"
                >
                  privacy@roomshare.com{" "}
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </a>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer Simple */}
      <footer className="py-8 text-center text-xs text-on-surface-variant bg-surface-canvas">
        © {new Date().getFullYear()} RoomShare Inc. All rights reserved.
      </footer>
    </div>
  );
}
