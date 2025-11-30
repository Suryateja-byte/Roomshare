import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, Flag } from 'lucide-react';
import ReportList from './ReportList';

export const metadata = {
    title: 'Reports Management | Admin | RoomShare',
    description: 'Manage reports on the RoomShare platform',
};

export default async function AdminReportsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/admin/reports');
    }

    // Check if user is admin
    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!currentUser?.isAdmin) {
        redirect('/');
    }

    // Fetch all reports
    const [reports, totalReports] = await Promise.all([
        prisma.report.findMany({
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        images: true,
                        owner: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                },
                reporter: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
                reviewer: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: [
                { status: 'asc' }, // OPEN first
                { createdAt: 'desc' }
            ],
            take: 100 // Limit for initial load
        }),
        prisma.report.count()
    ]);

    const openReportsCount = await prisma.report.count({ where: { status: 'OPEN' } });

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 text-zinc-600 hover:text-zinc-900 mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-red-100 rounded-xl relative">
                            <Flag className="w-6 h-6 text-red-600" />
                            {openReportsCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                    {openReportsCount}
                                </span>
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900">Reports Management</h1>
                            <p className="text-zinc-500">Review and resolve user reports</p>
                        </div>
                    </div>
                </div>

                {/* Report List */}
                <ReportList
                    initialReports={reports}
                    totalReports={totalReports}
                />
            </div>
        </div>
    );
}
