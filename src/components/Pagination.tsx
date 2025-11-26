'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

export default function Pagination({ currentPage, totalPages, totalItems, itemsPerPage }: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    if (totalPages <= 1) return null;

    const handlePageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', page.toString());
        router.push(`?${params.toString()}`, { scroll: false });
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

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <nav
            className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 sm:py-8"
            aria-label="Pagination navigation"
        >
            {/* Results info */}
            <p className="text-sm text-zinc-500 ">
                Showing <span className="font-medium text-zinc-900 ">{startItem}</span> to{' '}
                <span className="font-medium text-zinc-900 ">{endItem}</span> of{' '}
                <span className="font-medium text-zinc-900 ">{totalItems}</span> results
            </p>

            {/* Pagination controls */}
            <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
                {/* Previous button */}
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Go to previous page"
                    className="p-2.5 sm:p-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                <div className="flex items-center gap-0.5 sm:gap-1">
                    {getPageNumbers().map((page, index) => (
                        typeof page === 'number' ? (
                            <button
                                key={index}
                                onClick={() => handlePageChange(page)}
                                aria-label={`Page ${page}`}
                                aria-current={page === currentPage ? 'page' : undefined}
                                className={`min-w-[40px] sm:min-w-[36px] h-10 sm:h-9 px-2 sm:px-3 rounded-lg text-sm font-medium transition-colors touch-target ${
                                    page === currentPage
                                        ? 'bg-zinc-900 text-white '
                                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 '
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

                {/* Next button */}
                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Go to next page"
                    className="p-2.5 sm:p-2 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-target"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </nav>
    );
}
