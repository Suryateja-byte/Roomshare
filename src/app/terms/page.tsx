'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Scale, Gavel, AlertCircle, FileCheck, MapPin } from 'lucide-react';

const SECTIONS = [
    { id: 'acceptance', label: '1. Acceptance of Terms' },
    { id: 'account', label: '2. User Accounts' },
    { id: 'conduct', label: '3. User Conduct' },
    { id: 'content', label: '4. User Content' },
    { id: 'third-party', label: '5. Third-Party Services' },
    { id: 'termination', label: '6. Termination' },
    { id: 'liability', label: '7. Limitation of Liability' },
    { id: 'changes', label: '8. Changes to Terms' },
];

export default function TermsPage() {
    const [activeSection, setActiveSection] = useState('acceptance');

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
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollTo = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            window.scrollTo({ top: element.offsetTop - 100, behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 font-sans text-zinc-900 dark:text-white selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black">

            {/* Header */}
            <header className="fixed top-0 w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-800 z-50 h-16 flex items-center px-6">
                <div className="container mx-auto max-w-6xl flex items-center justify-between">
                    <a href="/" className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Back to Home
                    </a>
                    <span className="font-semibold tracking-tight">RoomShare<span className="text-zinc-400 dark:text-zinc-500">.</span> Terms</span>
                </div>
            </header>

            {/* Hero */}
            <div className="pt-32 pb-16 px-6 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800">
                <div className="container mx-auto max-w-4xl text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700 mb-6">
                        <Scale className="w-8 h-8 text-zinc-900 dark:text-white" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Terms of Service</h1>
                    <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                        Please read these terms carefully. By using RoomShare, you agree to be bound by these conditions.
                    </p>
                    <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-8 uppercase tracking-widest">Effective Date: December 14, 2025</p>
                </div>
            </div>

            <div className="container mx-auto max-w-6xl px-6 py-16 flex flex-col lg:flex-row gap-16">

                {/* Sidebar Navigation */}
                <aside className="lg:w-64 flex-shrink-0 hidden lg:block">
                    <div className="sticky top-32">
                        <h4 className="font-bold text-sm text-zinc-900 dark:text-white mb-4 uppercase tracking-wider pl-4">Contents</h4>
                        <nav className="space-y-1 border-l border-zinc-100 dark:border-zinc-800">
                            {SECTIONS.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => scrollTo(section.id)}
                                    className={`block w-full text-left px-4 py-2 text-sm transition-all border-l-2 -ml-[2px] ${activeSection === section.id
                                            ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white font-medium'
                                            : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex-1 max-w-3xl prose prose-zinc dark:prose-invert prose-lg">

                    <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-100 dark:border-zinc-800 mb-12 flex items-start gap-4 not-prose">
                        <AlertCircle className="w-6 h-6 text-zinc-900 dark:text-white shrink-0 mt-1" />
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed m-0">
                            <strong className="text-zinc-900 dark:text-white">Note:</strong> These Terms include a class action waiver and a waiver of jury trials, and require binding arbitration on an individual basis to resolve disputes.
                        </p>
                    </div>

                    <section id="acceptance" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-3">
                            1. Acceptance of Terms
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            By accessing or using the RoomShare website, mobile application, or any other services provided by RoomShare Inc. (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.
                        </p>
                    </section>

                    <section id="account" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">2. User Accounts</h2>
                        <p className="text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                            To access certain features of the Service, you may be required to register for an account. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose mt-6">
                            <div className="p-5 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                                <h4 className="font-bold text-zinc-900 dark:text-white mb-2">Account Security</h4>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">You are responsible for safeguarding your password and for all activities that occur under your account.</p>
                            </div>
                            <div className="p-5 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors">
                                <h4 className="font-bold text-zinc-900 dark:text-white mb-2">Verification</h4>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">We reserve the right to verify your identity through various means, including government ID.</p>
                            </div>
                        </div>
                    </section>

                    <section id="conduct" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">3. User Conduct</h2>
                        <p className="text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                            You agree not to use the Service to:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-zinc-600 dark:text-zinc-400 marker:text-zinc-300 dark:marker:text-zinc-600">
                            <li>Violate any local, state, national, or international law or regulation.</li>
                            <li>Transmit any material that is abusive, harassing, tortious, defamatory, vulgar, pornographic, obscene, libelous, invasive of another's privacy, hateful, or racially, ethnically, or otherwise objectionable.</li>
                            <li>Stalk, harass, or harm another individual.</li>
                            <li>Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity.</li>
                        </ul>
                    </section>

                    <section id="content" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">4. User Content</h2>
                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            You retain all rights in, and are solely responsible for, the User Content you post to RoomShare. By posting User Content, you grant RoomShare a non-exclusive, worldwide, royalty-free, irrevocable, sub-licensable, perpetual license to use, display, edit, modify, reproduce, distribute, store, and prepare derivative works of your User Content.
                        </p>
                    </section>

                    <section id="third-party" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-3">
                            <MapPin className="w-6 h-6 text-zinc-400 dark:text-zinc-500" /> 5. Third-Party Services
                        </h2>
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-100 dark:border-zinc-800">
                            <h4 className="font-semibold text-zinc-900 dark:text-white text-base mb-3">Google Maps Platform</h4>
                            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                                RoomShare integrates with Google Maps Platform to provide neighborhood exploration features. By using these features, you agree to be bound by Google&apos;s Terms of Service.
                            </p>
                            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                                When you use the neighborhood exploration feature:
                            </p>
                            <ul className="list-disc pl-5 space-y-2 text-zinc-600 dark:text-zinc-400 marker:text-zinc-300 dark:marker:text-zinc-600 mb-4">
                                <li>Location data is sent to Google to retrieve nearby place information.</li>
                                <li>You agree to comply with Google&apos;s acceptable use policies.</li>
                                <li>Google may display their own attribution and branding as required by their terms.</li>
                            </ul>
                            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                You must also comply with Google&apos;s{' '}
                                <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="text-zinc-900 dark:text-white underline underline-offset-2 hover:no-underline">
                                    Terms of Service
                                </a>{' '}
                                when using these features.
                            </p>
                        </div>
                    </section>

                    <section id="termination" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                            <Gavel className="w-6 h-6 text-zinc-400 dark:text-zinc-500" /> 6. Termination
                        </h2>
                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
                        </p>
                    </section>

                    <section id="liability" className="mb-16 scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">7. Limitation of Liability</h2>
                        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            In no event shall RoomShare, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
                        </p>
                    </section>

                    <section id="changes" className="scroll-mt-32">
                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">8. Changes to Terms</h2>
                        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-100 dark:border-zinc-800 flex gap-4">
                            <FileCheck className="w-8 h-8 text-zinc-900 dark:text-white shrink-0" />
                            <div>
                                <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed m-0">
                                    We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
                                </p>
                            </div>
                        </div>
                    </section>

                </div>
            </div>

            {/* Footer Simple */}
            <footer className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                © {new Date().getFullYear()} RoomShare Inc. All rights reserved.
            </footer>
        </div>
    );
}
