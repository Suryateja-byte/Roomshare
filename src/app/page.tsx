import { Suspense } from 'react';
import { auth } from '@/auth';
import HomeClient from './HomeClient';
import FeaturedListings from '@/components/FeaturedListings';

export default async function HomePage() {
    const session = await auth();
    const isLoggedIn = !!session?.user;

    return (
        <>
            <HomeClient isLoggedIn={isLoggedIn} />
            <Suspense fallback={
                <section className="py-16 md:py-24 bg-zinc-50 dark:bg-zinc-900/50">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6">
                        <div className="text-center mb-12">
                            <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-700 rounded-full mx-auto mb-4 animate-pulse" />
                            <div className="h-10 w-64 bg-zinc-200 dark:bg-zinc-700 rounded mx-auto mb-4 animate-pulse" />
                            <div className="h-6 w-96 bg-zinc-200 dark:bg-zinc-700 rounded mx-auto animate-pulse" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="bg-white dark:bg-zinc-800 rounded-3xl overflow-hidden animate-pulse">
                                    <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="p-4 space-y-3">
                                        <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
                                        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
                                        <div className="h-6 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            }>
                <FeaturedListings />
            </Suspense>
        </>
    );
}

