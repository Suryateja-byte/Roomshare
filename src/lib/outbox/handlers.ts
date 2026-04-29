/**
 * Outbox event handler routing table.
 *
 * Maps each OutboxKind to a handler function that processes the event within
 * a transaction. Each handler returns a HandlerResult that the drain worker
 * uses to determine what to do with the outbox row (complete, retry, DLQ).
 */

import type { TransactionClient } from "@/lib/db/with-actor";
import { features } from "@/lib/env";
import type { OutboxKind } from "@/lib/outbox/append";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";
import { handleTombstone } from "@/lib/projections/tombstone";
import { handleGeocodeNeeded } from "@/lib/projections/geocode-worker";
import {
  EmbeddingBudgetExceededError,
  rebuildSemanticInventoryProjection,
} from "@/lib/projections/semantic";
import {
  PaymentWebhookRetryableError,
  processCapturedStripeEvent,
} from "@/lib/payments/webhook-worker";
import {
  deliverQueuedSearchAlert,
  processSearchAlerts,
} from "@/lib/search-alerts";
import {
  recordProjectionLag,
  recordTombstoneHideLatency,
} from "@/lib/metrics/projection-lag";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { currentProjectionEpoch } from "@/lib/projections/epoch";
import { randomUUID } from "crypto";

export type HandlerResult =
  | { outcome: "completed" }
  | { outcome: "stale_skipped" }
  | { outcome: "transient_error"; retryAfterMs: number; lastError: string }
  | { outcome: "fatal_error"; dlqReason: string; lastError: string };

export interface OutboxRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  kind: string;
  payload: Record<string, unknown>;
  sourceVersion: bigint;
  unitIdentityEpoch: number;
  priority: number;
  attemptCount: number;
  createdAt: Date;
}

export type OutboxHandler = (
  tx: TransactionClient,
  event: OutboxRow
) => Promise<HandlerResult>;

// ─────────────────────────────────────────────────────────────────────────────
// Individual handlers
// ─────────────────────────────────────────────────────────────────────────────

function getPayloadString(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getPayloadStringArray(
  payload: Record<string, unknown>,
  key: string
): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getIdentityMutationAffectedUnitIds(event: OutboxRow): string[] {
  const fromUnitIds = getPayloadStringArray(event.payload, "fromUnitIds");
  const toUnitIds = getPayloadStringArray(event.payload, "toUnitIds");
  const affected = Array.from(new Set([...fromUnitIds, ...toUnitIds])).sort();

  if (affected.length > 0) {
    return affected;
  }

  return event.aggregateType === "PHYSICAL_UNIT" ? [event.aggregateId] : [];
}

async function resolveInventoryEventUnitId(
  tx: TransactionClient,
  event: OutboxRow
): Promise<string> {
  const payloadUnitId = getPayloadString(event.payload, "unitId");
  if (payloadUnitId) {
    return payloadUnitId;
  }

  const rows = await tx.$queryRaw<{ unit_id: string }[]>`
    SELECT unit_id
    FROM listing_inventories
    WHERE id = ${event.aggregateId}
    LIMIT 1
  `;

  return rows[0]?.unit_id ?? event.aggregateId;
}

async function handleInventoryUpserted(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    const inventoryId = event.aggregateId;
    const unitId = await resolveInventoryEventUnitId(tx, event);

    const result = await rebuildInventorySearchProjection(tx, {
      unitId,
      inventoryId,
      sourceVersion: event.sourceVersion,
      unitIdentityEpoch: event.unitIdentityEpoch,
    });

    if (result.skippedStale) {
      return { outcome: "stale_skipped" };
    }

    // Also rebuild unit public projection
    await rebuildUnitPublicProjection(tx, unitId, event.unitIdentityEpoch);

    // Enqueue cache invalidation
    const projectionEpoch = currentProjectionEpoch();
    const ciId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO cache_invalidations (id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at)
      VALUES (${ciId}, ${unitId}, ${projectionEpoch}::BIGINT, ${event.unitIdentityEpoch}, 'REPUBLISH', NOW())
    `;

    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleUnitUpserted(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  // UNIT_UPSERTED currently only needs to rebuild the unit public projection
  // (inventory-level rebuild is triggered by INVENTORY_UPSERTED events).
  // Stale detection: if the unit projection is already newer, no-op.
  try {
    await rebuildUnitPublicProjection(
      tx,
      event.aggregateId,
      event.unitIdentityEpoch
    );
    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleTombstoneEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    const inventoryId = (event.payload.inventoryId as string | null) ?? null;

    await handleTombstone(tx, {
      unitId: event.aggregateId,
      inventoryId,
      reason: "TOMBSTONE",
      unitIdentityEpoch: event.unitIdentityEpoch,
      sourceVersion: event.sourceVersion,
    });

    recordTombstoneHideLatency(
      event.aggregateId,
      Date.now() - event.createdAt.getTime()
    );
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleSuppressionEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    const inventoryId = (event.payload.inventoryId as string | null) ?? null;

    await handleTombstone(tx, {
      unitId: event.aggregateId,
      inventoryId,
      reason: "SUPPRESSION",
      unitIdentityEpoch: event.unitIdentityEpoch,
      sourceVersion: event.sourceVersion,
    });

    recordTombstoneHideLatency(
      event.aggregateId,
      Date.now() - event.createdAt.getTime()
    );
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handlePauseEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    const inventoryId = (event.payload.inventoryId as string | null) ?? null;

    await handleTombstone(tx, {
      unitId: event.aggregateId,
      inventoryId,
      reason: "PAUSE",
      unitIdentityEpoch: event.unitIdentityEpoch,
      sourceVersion: event.sourceVersion,
    });

    recordTombstoneHideLatency(
      event.aggregateId,
      Date.now() - event.createdAt.getTime()
    );
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleCacheInvalidate(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  // Mark the cache_invalidations row as consumed
  try {
    const cacheInvalidationId = event.payload.cacheInvalidationId as
      | string
      | undefined;
    if (cacheInvalidationId) {
      await tx.$executeRaw`
        UPDATE cache_invalidations
        SET consumed_at = NOW(),
            consumed_by = 'outbox-drain'
        WHERE id = ${cacheInvalidationId}
          AND consumed_at IS NULL
      `;
    }
    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleIdentityMutation(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  // Phase 02: Identity mutations fan out cache invalidations to every affected unit.
  try {
    if (features.pauseIdentityReconcile) {
      return {
        outcome: "transient_error",
        retryAfterMs: 60_000,
        lastError: "Identity reconciliation paused",
      };
    }

    const affectedUnitIds = getIdentityMutationAffectedUnitIds(event);
    if (affectedUnitIds.length === 0) {
      return {
        outcome: "fatal_error",
        dlqReason: "IDENTITY_MUTATION_NO_AFFECTED_UNITS",
        lastError: "IDENTITY_MUTATION event missing fromUnitIds/toUnitIds",
      };
    }

    const projectionEpoch = currentProjectionEpoch();

    for (const unitId of affectedUnitIds) {
      const ciId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO cache_invalidations (id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at)
        VALUES (${ciId}, ${unitId}, ${projectionEpoch}::BIGINT, ${event.unitIdentityEpoch}, 'IDENTITY_MUTATION', NOW())
      `;

      // Enqueue CACHE_INVALIDATE at priority=10
      await appendOutboxEvent(tx, {
        aggregateType: "PHYSICAL_UNIT",
        aggregateId: unitId,
        kind: "CACHE_INVALIDATE",
        payload: {
          unitId,
          cacheInvalidationId: ciId,
          reason: "IDENTITY_MUTATION",
          unitIdentityEpoch: event.unitIdentityEpoch,
          mutationId: event.aggregateId,
        },
        sourceVersion: event.sourceVersion,
        unitIdentityEpoch: event.unitIdentityEpoch,
        priority: 10,
      });
    }

    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleGeocodeNeededEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  if (features.pauseGeocodePublish) {
    return {
      outcome: "transient_error",
      retryAfterMs: 60_000,
      lastError: "Geocode publication paused",
    };
  }

  const geocodeEvent = {
    id: event.id,
    aggregateType: "PHYSICAL_UNIT" as const,
    aggregateId: event.aggregateId,
    payload: {
      address: event.payload.address as string,
      requestId: (event.payload.requestId as string | null) ?? null,
    },
    attemptCount: event.attemptCount,
  };

  const outcome = await handleGeocodeNeeded(tx, geocodeEvent);

  switch (outcome.status) {
    case "success":
      recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
      return { outcome: "completed" };
    case "not_found":
      // Terminal but not a failure; complete the row with a note in last_error
      return { outcome: "completed" };
    case "transient_error":
      return {
        outcome: "transient_error",
        retryAfterMs: outcome.retryAfterMs,
        lastError: "Geocode transient error",
      };
    case "exhausted":
      return {
        outcome: "fatal_error",
        dlqReason: outcome.dlqReason,
        lastError: "Geocode attempts exhausted",
      };
  }
}

async function handleEmbedNeededEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    if (features.pauseEmbedPublish) {
      return {
        outcome: "transient_error",
        retryAfterMs: 60_000,
        lastError: "Embedding publication paused",
      };
    }

    const inventoryId = event.aggregateId;
    const unitId = await resolveInventoryEventUnitId(tx, event);
    const result = await rebuildSemanticInventoryProjection(tx, {
      inventoryId,
      unitId,
      sourceVersion: event.sourceVersion,
      unitIdentityEpoch: event.unitIdentityEpoch,
    });

    if (result.skippedStale) {
      return { outcome: "stale_skipped" };
    }

    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs:
        err instanceof EmbeddingBudgetExceededError ? err.retryAfterMs : 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handlePaymentWebhookEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    await processCapturedStripeEvent(tx, event.aggregateId);
    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs:
        err instanceof PaymentWebhookRetryableError ? err.retryAfterMs : 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleAlertMatchEvent(
  _tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    await processSearchAlerts();
    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleAlertDeliverEvent(
  tx: TransactionClient,
  event: OutboxRow
): Promise<HandlerResult> {
  try {
    const deliveryId =
      typeof event.payload.deliveryId === "string"
        ? event.payload.deliveryId
        : event.aggregateId;
    const result = await deliverQueuedSearchAlert(tx, deliveryId);

    if (result.status === "retry") {
      return {
        outcome: "transient_error",
        retryAfterMs: 30_000,
        lastError: result.error,
      };
    }

    recordProjectionLag(event.kind, Date.now() - event.createdAt.getTime());
    return { outcome: "completed" };
  } catch (err) {
    return {
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler routing table
// ─────────────────────────────────────────────────────────────────────────────

export const HANDLERS: Record<OutboxKind, OutboxHandler> = {
  UNIT_UPSERTED: handleUnitUpserted,
  INVENTORY_UPSERTED: handleInventoryUpserted,
  IDENTITY_MUTATION: handleIdentityMutation,
  TOMBSTONE: handleTombstoneEvent,
  SUPPRESSION: handleSuppressionEvent,
  PAUSE: handlePauseEvent,
  CACHE_INVALIDATE: handleCacheInvalidate,
  GEOCODE_NEEDED: handleGeocodeNeededEvent,
  EMBED_NEEDED: handleEmbedNeededEvent,
  PAYMENT_WEBHOOK: handlePaymentWebhookEvent,
  ALERT_MATCH: handleAlertMatchEvent,
  ALERT_DELIVER: handleAlertDeliverEvent,
};
