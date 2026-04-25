import { prisma } from "../src/lib/prisma";

interface Args {
  target: string;
  previous: string | null;
  minRows: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const target = argv.find((arg) => arg.startsWith("--target="))?.slice(9);
  if (!target) {
    throw new Error("Usage: tsx scripts/embedding-shadow-swap.ts --target=<version> [--previous=<version>] [--min-rows=50] [--dry-run]");
  }

  const previous =
    argv.find((arg) => arg.startsWith("--previous="))?.slice(11) ?? null;
  const minRows = Number(
    argv.find((arg) => arg.startsWith("--min-rows="))?.slice(11) ?? "50"
  );

  return {
    target,
    previous,
    minRows: Number.isFinite(minRows) && minRows > 0 ? minRows : 50,
    dryRun: argv.includes("--dry-run"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const result = await prisma.$transaction(async (tx) => {
    const targetRows = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::BIGINT AS count
      FROM semantic_inventory_projection
      WHERE embedding_version = ${args.target}
        AND publish_status IN ('SHADOW', 'PUBLISHED')
    `;
    const targetCount = Number(targetRows[0]?.count ?? 0);
    if (targetCount < args.minRows) {
      throw new Error(
        `SEMANTIC_SWAP_COHERENCE_FAILED targetRows=${targetCount} minRows=${args.minRows}`
      );
    }

    if (args.dryRun) {
      return { targetRows: targetCount, staleRows: 0, publishedRows: 0 };
    }

    let staleRows = 0;
    if (args.previous) {
      staleRows = await tx.$executeRaw`
        UPDATE semantic_inventory_projection
        SET publish_status = 'STALE_PUBLISHED',
            updated_at = NOW()
        WHERE embedding_version = ${args.previous}
          AND publish_status = 'PUBLISHED'
      `;
    }

    const publishedRows = await tx.$executeRaw`
      UPDATE semantic_inventory_projection
      SET publish_status = 'PUBLISHED',
          published_at = NOW(),
          updated_at = NOW()
      WHERE embedding_version = ${args.target}
        AND publish_status IN ('SHADOW', 'BUILDING')
    `;

    return { targetRows: targetCount, staleRows, publishedRows };
  });

  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
