import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import VerificationList from './VerificationList';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default async function VerificationsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/admin/verifications');
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isAdmin: true }
    });

    if (!user?.isAdmin) {
        redirect('/');
    }

    // Get all verification requests
    const requests = await prisma.verificationRequest.findMany({
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    createdAt: true
                }
            }
        },
        orderBy: [
            { status: 'asc' }, // PENDING first
            { createdAt: 'asc' } // Oldest first
        ]
    });

    const pendingCount = requests.filter(r => r.status === 'PENDING').length;

    return (
        <div className="min-h-screen bg-zinc-50">
            <div className="max-w-5xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-700 mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-900">Verification Requests</h1>
                            <p className="text-zinc-500">
                                {pendingCount > 0
                                    ? `${pendingCount} pending verification${pendingCount > 1 ? 's' : ''}`
                                    : 'No pending verifications'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* Verification List */}
                <VerificationList initialRequests={requests} />
            </div>
        </div>
    );
}
