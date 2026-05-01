jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import {
  buildReviewedDocumentsExpireAt,
  parseLegacyPublicUrl,
  runBackfill,
} from "../../../scripts/backfill-verification-documents";

type VerificationRow = {
  id: string;
  userId: string;
  documentUrl: string | null;
  selfieUrl: string | null;
  documentPath: string | null;
  selfiePath: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  updatedAt: Date;
  reviewedAt: Date | null;
  documentsExpireAt: Date | null;
  documentsDeletedAt: Date | null;
};

function createRow(overrides: Partial<VerificationRow> = {}): VerificationRow {
  return {
    id: "request-1",
    userId: "user-1",
    documentUrl:
      "https://project.supabase.co/storage/v1/object/public/legacy-bucket/path/doc.jpg",
    selfieUrl: null,
    documentPath: null,
    selfiePath: null,
    status: "PENDING",
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    reviewedAt: null,
    documentsExpireAt: null,
    documentsDeletedAt: null,
    ...overrides,
  };
}

function createPrismaClient(rows: VerificationRow[]) {
  return {
    verificationRequest: {
      findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function createSupabaseClient(removeError: Error | null = null) {
  const upload = jest.fn().mockResolvedValue({ error: null });
  const remove = jest.fn().mockResolvedValue({ error: removeError });
  const from = jest.fn(() => ({ upload, remove }));
  return {
    client: { storage: { from } },
    from,
    upload,
    remove,
  };
}

function createFetch() {
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: jest.fn().mockResolvedValue(bytes.buffer),
  });
}

describe("backfill verification documents", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  it("parses legacy public URLs into bucket, path, extension, and MIME", () => {
    expect(
      parseLegacyPublicUrl(
        "https://project.supabase.co/storage/v1/object/public/verification/user%201/doc.jpeg",
        "project.supabase.co"
      )
    ).toEqual({
      bucket: "verification",
      objectPath: "user 1/doc.jpeg",
      extension: "jpg",
      mimeType: "image/jpeg",
    });
  });

  it("dry-run validates candidates without mutating storage or rows", async () => {
    const prismaClient = createPrismaClient([createRow()]);
    const supabase = createSupabaseClient();
    const fetchFn = createFetch();

    const summary = await runBackfill({
      argv: ["--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn,
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
    });

    expect(summary).toEqual(
      expect.objectContaining({
        mode: "dry-run",
        scanned: 1,
        candidateObjects: 1,
        migratedObjects: 0,
        sourceDeletedObjects: 0,
      })
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(prismaClient.verificationRequest.update).not.toHaveBeenCalled();
  });

  it("copies legacy objects privately, deletes the public source, and sets reviewed retention", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    const reviewedAt = new Date("2026-04-01T00:00:00.000Z");
    const prismaClient = createPrismaClient([
      createRow({ status: "APPROVED", reviewedAt }),
    ]);
    const supabase = createSupabaseClient();

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
      now,
    });

    expect(summary).toEqual(
      expect.objectContaining({
        mode: "apply",
        migratedObjects: 1,
        sourceDeletedObjects: 1,
        updatedRows: 1,
        retentionRowsUpdated: 1,
        failedObjects: 0,
      })
    );
    expect(supabase.from).toHaveBeenCalledWith("verification-documents");
    expect(supabase.upload).toHaveBeenCalledWith(
      "user-1/legacy/request-1/document.jpg",
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: true }
    );
    expect(supabase.from).toHaveBeenCalledWith("legacy-bucket");
    expect(supabase.remove).toHaveBeenCalledWith(["path/doc.jpg"]);
    expect(prismaClient.verificationRequest.update).toHaveBeenNthCalledWith(1, {
      where: { id: "request-1" },
      data: {
        documentPath: "user-1/legacy/request-1/document.jpg",
        documentMimeType: "image/jpeg",
      },
    });
    expect(
      prismaClient.verificationRequest.update.mock.invocationCallOrder[0]
    ).toBeLessThan(supabase.remove.mock.invocationCallOrder[0]);
    expect(prismaClient.verificationRequest.update).toHaveBeenNthCalledWith(2, {
      where: { id: "request-1" },
      data: {
        documentUrl: null,
      },
    });
    expect(prismaClient.verificationRequest.update).toHaveBeenNthCalledWith(3, {
      where: { id: "request-1" },
      data: {
        documentsExpireAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    });
  });

  it("keeps the private pointer and legacy URL when source deletion fails", async () => {
    const prismaClient = createPrismaClient([createRow()]);
    const supabase = createSupabaseClient(new Error("remove failed"));
    const stderr = { error: jest.fn() };

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr,
    });

    expect(summary.failedObjects).toBe(1);
    expect(summary.failedSourceDeletes).toBe(1);
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledTimes(1);
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        documentPath: "user-1/legacy/request-1/document.jpg",
        documentMimeType: "image/jpeg",
      },
    });
    expect(
      prismaClient.verificationRequest.update
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentUrl: null }),
      })
    );
    const logged = stderr.error.mock.calls.flat().join(" ");
    expect(logged).not.toContain("https://");
    expect(logged).not.toContain("path/doc.jpg");
  });

  it("sets reviewed retention when source deletion fails after persisting a private pointer", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    const reviewedAt = new Date("2026-04-01T00:00:00.000Z");
    const prismaClient = createPrismaClient([
      createRow({ status: "APPROVED", reviewedAt }),
    ]);
    const supabase = createSupabaseClient(new Error("remove failed"));
    const stderr = { error: jest.fn() };

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr,
      now,
    });

    expect(summary.failedSourceDeletes).toBe(1);
    expect(summary.retentionRowsUpdated).toBe(1);
    expect(prismaClient.verificationRequest.update).toHaveBeenNthCalledWith(1, {
      where: { id: "request-1" },
      data: {
        documentPath: "user-1/legacy/request-1/document.jpg",
        documentMimeType: "image/jpeg",
      },
    });
    expect(prismaClient.verificationRequest.update).toHaveBeenNthCalledWith(2, {
      where: { id: "request-1" },
      data: {
        documentsExpireAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    });
    expect(
      prismaClient.verificationRequest.update
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentUrl: null }),
      })
    );
    const logged = stderr.error.mock.calls.flat().join(" ");
    expect(logged).not.toContain("https://");
    expect(logged).not.toContain("path/doc.jpg");
  });

  it("keeps pending migrated rows without a retention expiry", async () => {
    const prismaClient = createPrismaClient([createRow({ status: "PENDING" })]);
    const supabase = createSupabaseClient();

    await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
    });

    const updateArg = prismaClient.verificationRequest.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("documentsExpireAt");
  });

  it("sets retention for already-migrated reviewed private documents", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    const reviewedAt = new Date("2026-04-01T00:00:00.000Z");
    const prismaClient = createPrismaClient([
      createRow({
        documentUrl: null,
        documentPath: "user-1/legacy/request-1/document.jpg",
        status: "APPROVED",
        reviewedAt,
      }),
    ]);
    const supabase = createSupabaseClient();
    const fetchFn = createFetch();

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn,
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
      now,
    });

    expect(summary.retentionRowsUpdated).toBe(1);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        documentsExpireAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    });
  });

  it("does not set retention for pending private documents", async () => {
    const prismaClient = createPrismaClient([
      createRow({
        documentUrl: null,
        documentPath: "user-1/legacy/request-1/document.jpg",
        status: "PENDING",
      }),
    ]);

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: createSupabaseClient().client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
    });

    expect(summary.retentionRowsUpdated).toBe(0);
    expect(prismaClient.verificationRequest.update).not.toHaveBeenCalled();
  });

  it("clears existing private legacy URLs only after source deletion succeeds", async () => {
    const prismaClient = createPrismaClient([
      createRow({
        documentPath: "user-1/legacy/request-1/document.jpg",
      }),
    ]);
    const supabase = createSupabaseClient();
    const fetchFn = createFetch();

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn,
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(summary.legacyUrlsAlreadyPrivate).toBe(1);
    expect(supabase.remove).toHaveBeenCalledWith(["path/doc.jpg"]);
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { documentUrl: null },
    });
    expect(supabase.remove.mock.invocationCallOrder[0]).toBeLessThan(
      prismaClient.verificationRequest.update.mock.invocationCallOrder[0]
    );
  });

  it("sets reviewed retention for existing private rows even when legacy URL deletion fails", async () => {
    const now = new Date("2026-04-10T00:00:00.000Z");
    const reviewedAt = new Date("2026-04-01T00:00:00.000Z");
    const prismaClient = createPrismaClient([
      createRow({
        documentPath: "user-1/legacy/request-1/document.jpg",
        status: "REJECTED",
        reviewedAt,
      }),
    ]);
    const supabase = createSupabaseClient(new Error("remove failed"));

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
      now,
    });

    expect(summary.failedSourceDeletes).toBe(1);
    expect(summary.retentionRowsUpdated).toBe(1);
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledTimes(1);
    expect(prismaClient.verificationRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        documentsExpireAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    });
  });

  it("keeps pending private rows without retention when legacy URL deletion fails", async () => {
    const prismaClient = createPrismaClient([
      createRow({
        documentPath: "user-1/legacy/request-1/document.jpg",
        status: "PENDING",
      }),
    ]);
    const supabase = createSupabaseClient(new Error("remove failed"));

    const summary = await runBackfill({
      argv: ["--apply", "--limit=1"],
      prismaClient: prismaClient as never,
      supabaseClient: supabase.client as never,
      fetchFn: createFetch(),
      stdout: { log: jest.fn() },
      stderr: { error: jest.fn() },
    });

    expect(summary.failedSourceDeletes).toBe(1);
    expect(summary.retentionRowsUpdated).toBe(0);
    expect(prismaClient.verificationRequest.update).not.toHaveBeenCalled();
  });

  it("expires old reviewed rows immediately when their retention window has passed", () => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    const expiresAt = buildReviewedDocumentsExpireAt(
      createRow({
        status: "REJECTED",
        reviewedAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
      now
    );

    expect(expiresAt).toEqual(now);
  });
});
