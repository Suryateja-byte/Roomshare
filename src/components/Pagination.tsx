'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { encodeStack, decodeStack } from '@/lib/search/cursor';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';

interface PaginationProps {
    currentPage: number;
    /** Total pages - null means "unknown count (>100 results)" for hybrid count optimization */
    totalPages: number | null;
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
    hasPrevPage: _hasPrevPage, // Intentionally unused - cursorStack is source of truth for keyset mode
}: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Use shared transition context if available, fall back to local transition for standalone use
    const transitionContext = useSearchTransitionSafe();
    const [localIsPending, localStartTransition] = useTransition();
    const isPending = transitionContext?.isPending ?? localIsPending;
    const startTransition = transitionContext?.startTransition ?? localStartTransition;

    // Determine if we're using keyset pagination (cursor available)
    // Note: We detect keyset mode by checking if nextCursor is explicitly provided (even if null)
    const useKeysetPagination = nextCursor !== undefined || prevCursor !== undefined;

    // Read cursor stack and page number from URL for keyset navigation history
    const cursorStack = useMemo(() => {
        const stackParam = searchParams.get('cursorStack');
        return stackParam ? decodeStack(stackParam) : [];
    }, [searchParams]);

    // Get current page number from URL (for keyset mode, pageNumber tracks position)
    const pageNumber = useMemo(() => {
        const pageNumParam = searchParams.get('pageNumber');
        if (pageNumParam) {
            const num = parseInt(pageNumParam, 10);
            if (Number.isFinite(num) && num >= 1) return num;
        }
        // Fall back to currentPage prop (from server) or 1
        return currentPage ?? 1;
    }, [searchParams, currentPage]);

    // For keyset pagination, we can go back if we're past page 1.
    // We use pageNumber > 1 (not cursorStack.length) because:
    // - On page 1→2, currentCursor is null so nothing gets pushed to stack
    // - pageNumber accurately tracks position regardless of stack state
    // - The prev handler correctly clears cursor when returning to page 1
    // For offset pagination with unknown totals, rely on hasNextPage if available
    // Otherwise assume there's a next page (server will return empty if not)
    const canGoNext = useKeysetPagination
        ? (hasNextPage ?? false) && (nextCursor !== null && nextCursor !== undefined)
        : totalPages !== null ? currentPage < totalPages : (hasNextPage ?? true);
    const canGoPrev = useKeysetPagination
        ? pageNumber > 1
        : currentPage > 1;

    // Don't hide pagination in keyset mode (even with unknown totals)
    // Only hide in offset mode when we KNOW there's just 1 page
    const hasKnownSinglePage = totalPages !== null && totalPages <= 1;
    if (hasKnownSinglePage && !useKeysetPagination) return null;
    // For keyset mode with unknown totals, hide only if no navigation possible
    if (useKeysetPagination && !canGoNext && !canGoPrev) return null;

    // Handle offset-based page navigation (clicking specific page number)
    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', page.toString());
        // Clear keyset pagination params when using offset pagination
        params.delete('cursor');
        params.delete('cursorStack');
        params.delete('pageNumber');
        const url = `?${params.toString()}`;

        // Use shared navigation if available (shows loading overlay across all search components)
        if (transitionContext) {
            transitionContext.navigateWithTransition(url, { scroll: false });
        } else {
            startTransition(() => {
                router.push(url, { scroll: false });
            });
        }
    };

    // Handle cursor-based navigation (next/prev with keyset)
    const handleCursorNavigation = (direction: 'next' | 'prev') => {
        const params = new URLSearchParams(searchParams.toString());
        const currentCursor = searchParams.get('cursor');

        if (direction === 'next') {
            // Going forward: push current cursor onto stack, advance to next cursor
            if (nextCursor) {
                const newStack = [...cursorStack];
                if (currentCursor) {
                    newStack.push(currentCursor);
                }

                params.set('cursor', nextCursor);
                if (newStack.length > 0) {
                    params.set('cursorStack', encodeStack(newStack));
                } else {
                    params.delete('cursorStack');
                }
                params.set('pageNumber', (pageNumber + 1).toString());
                params.delete('page'); // Clear offset pagination
            } else {
                // Fallback to offset if no next cursor
                const targetPage = pageNumber + 1;
                params.set('page', targetPage.toString());
                params.delete('cursor');
                params.delete('cursorStack');
                params.delete('pageNumber');
            }
        } else {
            // Going back: pop cursor from stack, navigate to popped cursor
            if (cursorStack.length > 0) {
                const newStack = [...cursorStack];
                const prevCursorFromStack = newStack.pop();

                if (prevCursorFromStack) {
                    params.set('cursor', prevCursorFromStack);
                } else {
                    // First page - clear cursor
                    params.delete('cursor');
                }

                if (newStack.length > 0) {
                    params.set('cursorStack', encodeStack(newStack));
                } else {
                    params.delete('cursorStack');
                }
                params.set('pageNumber', Math.max(1, pageNumber - 1).toString());
                params.delete('page');
            } else if (pageNumber > 1) {
                // Stack is empty but we're not on page 1 - go to page 1
                params.delete('cursor');
                params.delete('cursorStack');
                params.set('pageNumber', '1');
                params.delete('page');
            } else {
                // Already on page 1, nothing to do
                console.warn('[Pagination] Cannot go back: already on first page');
                return;
            }
        }

        const url = `?${params.toString()}`;

        // Use shared navigation if available (shows loading overlay across all search components)
        if (transitionContext) {
            transitionContext.navigateWithTransition(url, { scroll: false });
        } else {
            startTransition(() => {
                router.push(url, { scroll: false });
            });
        }
    };

    // Generate page numbers to show
    // Returns null when totalPages is unknown (keyset mode with >100 results)
    const getPageNumbers = (): (number | string)[] | null => {
        // When total is unknown, don't show numbered page buttons
        if (totalPages === null) {
            return null;
        }

        const pages: (number | string)[] = [];
        const showEllipsis = totalPages > 7;

        if (!showEllipsis) {
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            if (pageNumber > 3) {
                pages.push('...');
            }

            // Show pages around current page
            const start = Math.max(2, pageNumber - 1);
            const end = Math.min(totalPages - 1, pageNumber + 1);

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (pageNumber < totalPages - 2) {
                pages.push('...');
            }

            // Always show last page
            if (totalPages > 1) {
                pages.push(totalPages);
            }
        }

        return pages;
    };

    // Use pageNumber for range text display (works for both offset and keyset modes)
    const startItem = (pageNumber - 1) * itemsPerPage + 1;
    // When totalItems is null (unknown count), use page-based estimation
    const pageEndItem = pageNumber * itemsPerPage;
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

                {/* Page numbers or simple page indicator */}
                {/* When totalPages is unknown, show "Page X" indicator instead of numbered buttons */}
                {(() => {
                    const pageNumbers = getPageNumbers();
                    // Unknown total: show simple "Page X" indicator
                    if (pageNumbers === null) {
                        return (
                            <div className="flex items-center px-3">
                                <span className="text-sm font-medium text-zinc-900 dark:text-white">
                                    Page {pageNumber}
                                </span>
                            </div>
                        );
                    }
                    // Known total: show clickable page numbers
                    return (
                        <div className="flex items-center gap-0.5 sm:gap-1">
                            {pageNumbers.map((page, index) => (
                                typeof page === 'number' ? (
                                    <button
                                        key={index}
                                        onClick={() => handlePageChange(page)}
                                        disabled={isPending}
                                        aria-label={`Page ${page}`}
                                        aria-current={page === pageNumber ? 'page' : undefined}
                                        className={`min-w-[40px] sm:min-w-[36px] h-10 sm:h-9 px-2 sm:px-3 rounded-lg text-sm font-medium transition-colors touch-target disabled:cursor-not-allowed ${page === pageNumber
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
                    );
                })()}

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
