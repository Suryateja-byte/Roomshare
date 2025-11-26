import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import CreateListingForm from './CreateListingForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function CreateListingPage() {
    const session = await auth();

    if (!session || !session.user) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-zinc-50/50 font-sans selection:bg-zinc-900 selection:text-white ">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 mb-8 sm:mb-12">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-900 transition-colors mb-6 sm:mb-8 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to home
                </Link>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-zinc-900 tracking-tight mb-4 leading-tight">
                    List your sanctuary.
                </h1>
                <p className="text-base sm:text-lg text-zinc-500 font-light max-w-xl leading-relaxed">
                    Share your space with someone who fits your lifestyle.
                    Tell us about your place, your vibe, and what you're looking for.
                </p>
            </div>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
                <div className="bg-white rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 ">
                    <CreateListingForm />
                </div>
            </main>
        </div>
    );
}
