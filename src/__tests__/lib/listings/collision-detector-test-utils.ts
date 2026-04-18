import type { PrismaTx } from "@/lib/listings/collision-detector";

export type SeedCollisionRow = {
  id: string;
  ownerId: string;
  normalizedAddress: string | null;
  title: string;
  moveInDate: string | null;
  availableUntil: string | null;
  openSlots: number | null;
  totalSlots: number;
  createdAt: string;
  status: string;
  statusReason: string | null;
  needsMigrationReview: boolean;
};

export function createSeedCollisionRow(
  overrides: Partial<SeedCollisionRow> = {}
): SeedCollisionRow {
  return {
    id: "listing-1",
    ownerId: "owner-1",
    normalizedAddress: "123 main st austin tx 78701",
    title: "Private Room",
    moveInDate: "2026-05-01",
    availableUntil: "2026-08-01",
    openSlots: 1,
    totalSlots: 2,
    createdAt: "2026-04-01T12:00:00.000Z",
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    ...overrides,
  };
}

function toDateOnlyMillis(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  const isoDate = directMatch ? directMatch[1] : value;
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function matchesCollision(
  row: SeedCollisionRow,
  ownerId: string,
  normalizedAddress: string,
  incomingWindowEnd: string,
  incomingMoveInDate: string
): boolean {
  if (row.ownerId !== ownerId) {
    return false;
  }

  if (row.status !== "ACTIVE" && row.status !== "PAUSED") {
    return false;
  }

  if (row.normalizedAddress !== normalizedAddress) {
    return false;
  }

  const rowMoveInDate = toDateOnlyMillis(row.moveInDate);
  const rowAvailableUntil = toDateOnlyMillis(row.availableUntil);
  const requestMoveInDate = toDateOnlyMillis(incomingMoveInDate);
  const requestWindowEnd =
    toDateOnlyMillis(incomingWindowEnd) ?? rowMoveInDate;

  if (!rowMoveInDate || !requestMoveInDate || !requestWindowEnd) {
    return false;
  }

  return (
    rowMoveInDate <= requestWindowEnd &&
    (rowAvailableUntil === null || rowAvailableUntil >= requestMoveInDate)
  );
}

export function makeCollisionDetectorTx(rows: SeedCollisionRow[]): {
  tx: PrismaTx;
  queryRawMock: jest.Mock;
} {
  const queryRawMock = jest.fn().mockImplementation(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(" ");

      if (sql.includes('FROM "Listing" l')) {
        const ownerId = String(values[0] ?? "");
        const normalizedAddress = String(values[1] ?? "");
        const incomingWindowEnd = String(values[2] ?? "");
        const incomingMoveInDate = String(values[3] ?? "");

        return rows
          .filter((row) =>
            matchesCollision(
              row,
              ownerId,
              normalizedAddress,
              incomingWindowEnd,
              incomingMoveInDate
            )
          )
          .slice(0, 5)
          .map((row) => ({
            id: row.id,
            title: row.title,
            moveInDate: row.moveInDate,
            availableUntil: row.availableUntil,
            openSlots: row.openSlots,
            totalSlots: row.totalSlots,
            createdAt: row.createdAt,
            status: row.status,
            statusReason: row.statusReason,
          }));
      }

      if (
        sql.includes('COUNT(*)::int AS count') &&
        sql.includes('"normalizedAddress"')
      ) {
        const ownerId = String(values[0] ?? "");
        const normalizedAddress = String(values[1] ?? "");
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const count = rows.filter((row) => {
          const createdAt = new Date(row.createdAt).getTime();
          return (
            row.ownerId === ownerId &&
            row.normalizedAddress === normalizedAddress &&
            Number.isFinite(createdAt) &&
            createdAt > cutoff
          );
        }).length;

        return [{ count }];
      }

      throw new Error(`Unhandled mock query: ${sql}`);
    }
  );

  return {
    tx: {
      $queryRaw: queryRawMock,
    } as unknown as PrismaTx,
    queryRawMock,
  };
}
