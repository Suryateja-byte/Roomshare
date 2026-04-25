/**
 * Geocode worker — handles GEOCODE_NEEDED outbox events.
 *
 * Wraps the existing geocodeAddress() function (src/lib/geocoding.ts:10).
 * On success: updates physical_units geocode columns, transitions pending
 * listing_inventories from PENDING_GEOCODE → PENDING_PROJECTION, and enqueues
 * INVENTORY_UPSERTED events so the projection builder picks them up.
 *
 * On not_found: records geocode_status='NOT_FOUND'; listing stays PENDING_GEOCODE
 * permanently until manual intervention.
 *
 * On error: returns transient_error with backoff. After MAX_ATTEMPTS, returns
 * exhausted so the drain worker routes to DLQ.
 */

import type { TransactionClient } from "@/lib/db/with-actor";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { geocodeAddress } from "@/lib/geocoding";
import { MAX_ATTEMPTS } from "@/lib/projections/alert-thresholds";
import { isCircuitOpenError } from "@/lib/circuit-breaker";

export interface GeocodeOutboxEvent {
  id: string;
  aggregateType: "PHYSICAL_UNIT";
  aggregateId: string;
  payload: { address: string; requestId: string | null };
  attemptCount: number;
}

export type GeocodeHandlerOutcome =
  | { status: "success"; publishedStatus: "PENDING_PROJECTION" }
  | { status: "not_found" }
  | { status: "transient_error"; retryAfterMs: number }
  | { status: "exhausted"; dlqReason: "GEOCODE_EXHAUSTED" };

/**
 * Compute exponential backoff with jitter.
 * Starts at 30s, doubles each attempt, capped at 1 hour.
 */
function backoffMs(attemptCount: number): number {
  const baseMs = 30_000;
  const maxMs = 60 * 60 * 1000; // 1 hour
  const exponential = Math.min(baseMs * Math.pow(2, attemptCount), maxMs);
  // ±20% jitter
  const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

/**
 * Handle a GEOCODE_NEEDED outbox event.
 *
 * Dependency injection via `deps` allows tests to stub out geocodeAddress.
 */
export async function handleGeocodeNeeded(
  tx: TransactionClient,
  event: GeocodeOutboxEvent,
  deps?: { geocode?: typeof geocodeAddress }
): Promise<GeocodeHandlerOutcome> {
  const geocodeFn = deps?.geocode ?? geocodeAddress;
  const unitId = event.aggregateId;

  let result;
  try {
    result = await geocodeFn(event.payload.address);
  } catch (err) {
    // Circuit breaker open or unexpected throw
    if (isCircuitOpenError(err)) {
      if (event.attemptCount >= MAX_ATTEMPTS) {
        return { status: "exhausted", dlqReason: "GEOCODE_EXHAUSTED" };
      }
      return {
        status: "transient_error",
        retryAfterMs: backoffMs(event.attemptCount),
      };
    }
    if (event.attemptCount >= MAX_ATTEMPTS) {
      return { status: "exhausted", dlqReason: "GEOCODE_EXHAUSTED" };
    }
    return {
      status: "transient_error",
      retryAfterMs: backoffMs(event.attemptCount),
    };
  }

  if (result.status === "not_found") {
    // Terminal state — listing stays PENDING_GEOCODE; update unit status
    await tx.$executeRaw`
      UPDATE physical_units
      SET geocode_status = 'NOT_FOUND',
          updated_at     = NOW()
      WHERE id = ${unitId}
    `;
    return { status: "not_found" };
  }

  if (result.status === "error") {
    if (event.attemptCount >= MAX_ATTEMPTS) {
      return { status: "exhausted", dlqReason: "GEOCODE_EXHAUSTED" };
    }
    return {
      status: "transient_error",
      retryAfterMs: backoffMs(event.attemptCount),
    };
  }

  // success
  const { lat, lng } = result;

  // Coarsen public_point: round to ~1km grid (±0.01 deg ≈ 1km)
  const publicLat = Math.round(lat * 100) / 100;
  const publicLng = Math.round(lng * 100) / 100;
  const publicCellId = `${publicLat.toFixed(2)},${publicLng.toFixed(2)}`;
  // WKT representation used as TEXT in PGlite environments
  const exactPointWkt = `POINT(${lng} ${lat})`;
  const publicPointWkt = `POINT(${publicLng} ${publicLat})`;

  // Update physical_units with geocode results
  await tx.$executeRaw`
    UPDATE physical_units
    SET geocode_status  = 'COMPLETE',
        exact_point     = ${exactPointWkt},
        public_point    = ${publicPointWkt},
        public_cell_id  = ${publicCellId},
        source_version  = source_version + 1,
        updated_at      = NOW()
    WHERE id = ${unitId}
  `;

  // Transition PENDING_GEOCODE → PENDING_PROJECTION for associated inventories
  const affectedInventories = await tx.$queryRaw<{ id: string; source_version: bigint; unit_identity_epoch_written_at: number }[]>`
    UPDATE listing_inventories
    SET publish_status = 'PENDING_PROJECTION',
        updated_at     = NOW()
    WHERE unit_id       = ${unitId}
      AND publish_status = 'PENDING_GEOCODE'
    RETURNING id, source_version, unit_identity_epoch_written_at
  `;

  // Enqueue INVENTORY_UPSERTED for each transitioned inventory
  for (const inv of affectedInventories) {
    await appendOutboxEvent(tx, {
      aggregateType: "LISTING_INVENTORY",
      aggregateId: inv.id,
      kind: "INVENTORY_UPSERTED",
      payload: {
        unitId,
        triggeredBy: "geocode_complete",
        requestId: event.payload.requestId,
      },
      sourceVersion: BigInt(inv.source_version as unknown as number),
      unitIdentityEpoch: inv.unit_identity_epoch_written_at,
      priority: 100,
    });
  }

  return { status: "success", publishedStatus: "PENDING_PROJECTION" };
}
