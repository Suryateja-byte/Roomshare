/**
 * Dead-letter queue routing for outbox events.
 *
 * Routes an exhausted or fatally-failed outbox event to DLQ status so it
 * stops being retried. The drain worker calls this after MAX_ATTEMPTS exhaustion
 * or after a handler returns a fatal_error outcome.
 */

import type { TransactionClient } from "@/lib/db/with-actor";

/**
 * Move an outbox event to DLQ status.
 *
 * Sets status='DLQ', records dlq_reason and last_error. The row is kept for
 * audit purposes — operators can manually re-queue or discard.
 *
 * @param tx              Active transaction client
 * @param outboxEventId   ID of the outbox_events row
 * @param reason          Short machine-readable reason (e.g. 'GEOCODE_EXHAUSTED', 'MAX_ATTEMPTS_EXHAUSTED')
 * @param lastError       Human-readable error string from last attempt
 */
export async function routeToDlq(
  tx: TransactionClient,
  outboxEventId: string,
  reason: string,
  lastError: string
): Promise<void> {
  await tx.outboxEvent.update({
    where: { id: outboxEventId },
    data: {
      status: "DLQ",
      dlqReason: reason,
      lastError,
    },
  });
}
