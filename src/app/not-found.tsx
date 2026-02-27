import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
            <div className="space-y-6 max-w-md">
                <div className="w-24 h-24 bg-zinc-100 dark:bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Home className="w-10 h-10 text-zinc-600 dark:text-zinc-400" />
                </div>

                <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
                    Oops! We couldn't find that room.
                </h1>

                <p className="text-lg text-zinc-600 dark:text-zinc-400">
                    The listing you're looking for might have been removed or doesn't exist.
                </p>

                <div className="pt-4">
                    <Button asChild size="lg" className="rounded-full px-8">
                        <Link href="/search">
                            <Search className="mr-2 h-4 w-4" />
                            Back to Search
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
