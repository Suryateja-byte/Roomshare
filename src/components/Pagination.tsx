'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    /** Total items - null means "unknown count (>100 results)" for hybrid count optimization */
    totalItems: number | null;
    itemsPerPage: number;
    /** Optional keyset cursor for next page (base64url encoded) */
    nextCursor?: string | null;
    /** Optional keyset cursor for previous page (base64url encoded) */
    prevCursor?: string | null;
    /** Whether there's a next page (used with keyset pagination) */
    hasNextPage?: boolean;
    /** Whether there's a previous page (used with keyset pagination) */
    hasPrevPage?: boolean;
}

export default function Pagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    nextCursor,
    prevCursor,
    hasNextPage,
    hasPrevPage,
}: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Determine if we're using keyset pagination (cursor available)
    // Note: We detect keyset mode by checking if nextCursor is explicitly provided (even if null)
    const useKeysetPagination = nextCursor !== undefined || prevCursor !== undefined;

    // For keyset pagination, we need actual cursors to navigate (not just flags)
    // hasPrevPage may be true but without prevCursor we can't navigate back in keyset mode
    const canGoNext = useKeysetPagination
        ? (hasNextPage ?? false) && (nextCursor !== null && nextCursor !== undefined)
        : currentPage < totalPages;
    const canGoPrev = useKeysetPagination
        ? (hasPrevPage ?? false) && (prevCursor !== null && prevCursor !== undefined)
        : currentPage > 1;

    if (totalPages <= 1 && !useKeysetPagination) return null;

    // Handle offset-based page navigation (clicking specific page number)
    const handlePageChange = (page: number) => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('page', page.toString());
            params.delete('cursor'); // Clear cursor when using offset pagination
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    // Handle cursor-based navigation (next/prev with keyset)
    const handleCursorNavigation = (direction: 'next' | 'prev') => {
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            const cursor = direction === 'next' ? nextCursor : prevCursor;

            if (cursor) {
                params.set('cursor', cursor);
                params.delete('page'); // Clear page when using cursor pagination
            } else if (currentPage !== null && Number.isFinite(currentPage)) {
                // Fallback to offset only if we have a valid page number
                const targetPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
                params.set('page', targetPage.toString());
                params.delete('cursor');
            } else {
                // No cursor and no valid page - cannot navigate (shouldn't happen with canGoNext/canGoPrev checks)
                console.warn('[Pagination] Cannot navigate: no cursor and invalid page number');
                return;
            }

            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    // Generate page numbers to show
    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const showEllipsis = totalPages > 7;

        if (!showEllipsis) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            if (currentPage > 3) {
                pages.push('...');
            }

            // Show pages around current page
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('...');
            }

            // Always show last page
            if (totalPages > 1) {
                pages.push(totalPages);
            }
        }

        return pages;
    };

    // Handle null currentPage (keyset pagination doesn't track page numbers)
    // For keyset mode, we can't show accurate "X to Y of Z" without page numbers
    const effectivePage = currentPage ?? 1;
    const startItem = (effectivePage - 1) * itemsPerPage + 1;
    // When totalItems is null (unknown count), use page-based estimation
    const pageEndItem = effectivePage * itemsPerPage;
    const endItem = totalItems !== null ? Math.min(pageEndItem, totalItems) : pageEndItem;

    return (
        <nav
            className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-6 sm:py-8 transition-opacity ${isPending ? 'opacity-70' : ''}`}
            aria-label="Pagination navigation"
            aria-busy={isPending}
        >
            {/* Results info */}
            <p className="text-sm text-zinc-500 ">
                Showing <span className="font-medium text-zinc-900 ">{startItem}</span> to{' '}
                <span className="font-medium text-zinc-900 ">{endItem}</span> of{' '}
                <span className="font-medium text-zinc-900 ">{totalItems !== null ? totalItems : '100+'}</span> results
                {isPending && <span className="ml-2 text-zinc-400">(Loading...)</span>}
            </p>

            {/* Pagination controls */}
            <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
                {/* Previous button */}
                <button
                    onClick={() => useKeysetPagination
                        ? handleCursorNavigation('prev')
                        : handlePageChange(currentPage - 1)
                    }
                    disabled={!canGoPrev || isPending}
                    aria-label="Go to previous page"
                    className="p-2.5 sm:p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target"
                >
                    {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <ChevronLeft className="w-4 h-4" />
                    )}
                </button>

                {/* Page numbers - only show when we have valid page numbers (offset mode or keyset with known page) */}
                {/* In pure keyset mode, we can only go prev/next, not jump to arbitrary pages */}
                {(!useKeysetPagination || (currentPage !== null && Number.isFinite(currentPage))) && (
                    <div className="flex items-center gap-0.5 sm:gap-1">
                        {getPageNumbers().map((page, index) => (
                            typeof page === 'number' ? (
                                <button
                                    key={index}
                                    onClick={() => handlePageChange(page)}
                                    disabled={isPending}
                                    aria-label={`Page ${page}`}
                                    aria-current={page === effectivePage ? 'page' : undefined}
                                    className={`min-w-[40px] sm:min-w-[36px] h-10 sm:h-9 px-2 sm:px-3 rounded-lg text-sm font-medium transition-colors touch-target disabled:cursor-not-allowed ${page === effectivePage
                                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white disabled:hover:bg-transparent'
                                        }`}
                                >
                                    {page}
                                </button>
                            ) : (
                                <span key={index} className="px-1 sm:px-2 text-zinc-400 " aria-hidden="true">
                                    {page}
                                </span>
                            )
                        ))}
                    </div>
                )}

                {/* Next button */}
                <button
                    onClick={() => useKeysetPagination
                        ? handleCursorNavigation('next')
                        : handlePageChange(currentPage + 1)
                    }
                    disabled={!canGoNext || isPending}
                    aria-label="Go to next page"
                    className="p-2.5 sm:p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target"
                >
                    {isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <ChevronRight className="w-4 h-4" />
                    )}
                </button>
            </div>
        </nav>
    );
}
