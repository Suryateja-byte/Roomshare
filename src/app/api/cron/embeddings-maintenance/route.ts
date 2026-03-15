import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { recoverStuckEmbeddings } from '@/lib/embeddings/sync';
import { features } from '@/lib/env';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import { validateCronAuth } from '@/lib/cron-auth';

interface StatusCount {
    embedding_status: string;
    count: bigint;
}

export async function GET(request: NextRequest) {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    if (!features.semanticSearch) {
        return NextResponse.json({ skipped: true, reason: 'ENABLE_SEMANTIC_SEARCH is not true' });
    }

    try {
        const startTime = Date.now();

        // Recover stuck embeddings (PROCESSING > 10 minutes → PENDING)
        const recovered = await recoverStuckEmbeddings(10);

        // Query embedding status counts
        const statusRows = await prisma.$queryRaw<StatusCount[]>`
            SELECT embedding_status, COUNT(*)::bigint as count
            FROM listing_search_docs
            GROUP BY embedding_status
        `;

        const status: Record<string, number> = {};
        let total = 0;
        for (const row of statusRows) {
            const count = Number(row.count);
            status[row.embedding_status ?? 'NULL'] = count;
            total += count;
        }

        const duration = Date.now() - startTime;
        logger.sync.info('[embeddings-maintenance] Completed', {
            recovered,
            status,
            total,
            duration,
        });

        return NextResponse.json({
            success: true,
            recovered,
            status,
            total,
            duration: `${duration}ms`,
        });
    } catch (error) {
        logger.sync.error('[embeddings-maintenance] Cron error', {
            error: sanitizeErrorMessage(error),
        });
        Sentry.captureException(error, { tags: { cron: 'embeddings-maintenance' } });
        return NextResponse.json(
            { success: false, error: 'Embeddings maintenance failed' },
            { status: 500 },
        );
    }
}
