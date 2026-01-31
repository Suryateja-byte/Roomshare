import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CreateListingForm from './CreateListingForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { calculateProfileCompletion } from '@/lib/profile-completion';
import ProfileWarningBanner from './ProfileWarningBanner';

export default async function CreateListingPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect('/login');
    }

    // Check profile completion (soft warning, not blocking)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            name: true,
            email: true,
            emailVerified: true,
            bio: true,
            image: true,
            countryOfOrigin: true,
            languages: true,
            isVerified: true
        }
    });

    if (!user) {
        redirect('/login');
    }

    const profileCompletion = calculateProfileCompletion(user);

    return (
        <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-zinc-100 dark:selection:text-zinc-900">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 mb-8 sm:mb-12">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-6 sm:mb-8 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to home
                </Link>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-4 leading-tight">
                    List your sanctuary.
                </h1>
                <p className="text-base sm:text-lg text-zinc-500 dark:text-zinc-400 font-light max-w-xl leading-relaxed">
                    Share your space with someone who fits your lifestyle.
                    Tell us about your place, your vibe, and what you're looking for.
                </p>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
                {/* Soft warning banner if profile is less than 60% complete */}
                {profileCompletion.percentage < 60 && (
                    <ProfileWarningBanner
                        percentage={profileCompletion.percentage}
                        missing={profileCompletion.missing}
                    />
                )}

                <div className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-zinc-100 dark:border-zinc-800">
                    <CreateListingForm />
                </div>
            </div>
        </div>
    );
}
