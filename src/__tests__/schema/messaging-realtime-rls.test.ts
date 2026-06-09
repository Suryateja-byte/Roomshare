import fs from "fs";
import path from "path";

describe("messaging realtime RLS migration", () => {
  let migrationSql: string;

  beforeAll(() => {
    migrationSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260605000000_messaging_realtime_rls/migration.sql"
      ),
      "utf-8"
    );
  });

  it("adds Message to Supabase Realtime publication only when needed", () => {
    expect(migrationSql).toContain("pg_publication_tables");
    expect(migrationSql).toContain("tablename = 'Message'");
    expect(migrationSql).toContain(
      'ALTER PUBLICATION supabase_realtime ADD TABLE public."Message"'
    );
  });

  it("enables RLS and allows only authenticated realtime message reads", () => {
    expect(migrationSql).toContain(
      'ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY'
    );
    expect(migrationSql).toContain(
      'CREATE POLICY "roomshare_realtime_select_messages"'
    );
    expect(migrationSql).toContain("FOR SELECT");
    expect(migrationSql).toContain("TO authenticated");
    expect(migrationSql).toContain(
      'GRANT SELECT ON TABLE public."Message" TO authenticated'
    );
  });

  it("uses signed Roomshare JWT claims rather than auth.uid()", () => {
    expect(migrationSql).toContain("request.jwt.claims");
    expect(migrationSql).toContain("roomshare_user_id");
    expect(migrationSql).toContain("roomshare_conversation_id");
    expect(migrationSql).not.toContain("auth.uid()");
  });

  it("checks active participant access and per-user conversation deletion", () => {
    expect(migrationSql).toContain(
      "roomshare_realtime_can_access_conversation"
    );
    expect(migrationSql).toContain('conversation."deletedAt" IS NULL');
    expect(migrationSql).toContain('participant."B" = claimed_user_id');
    expect(migrationSql).toContain('"ConversationDeletion"');
    expect(migrationSql).toContain('deletion."userId" = claimed_user_id');
  });

  it("adds private broadcast and presence policies when realtime.messages exists", () => {
    expect(migrationSql).toContain("to_regclass('realtime.messages')");
    expect(migrationSql).toContain(
      'CREATE POLICY "roomshare_realtime_private_channel_read"'
    );
    expect(migrationSql).toContain(
      'CREATE POLICY "roomshare_realtime_private_channel_write"'
    );
    expect(migrationSql).toContain(
      "realtime.messages.extension IN ('broadcast', 'presence')"
    );
    expect(migrationSql).toContain("realtime.topic()");
    expect(migrationSql).toContain("chat:");
  });

  it("documents rollback without automatically disabling Message RLS", () => {
    expect(migrationSql).toContain(
      'ALTER PUBLICATION supabase_realtime DROP TABLE public."Message"'
    );
    expect(migrationSql).toContain(
      'DROP POLICY IF EXISTS "roomshare_realtime_select_messages"'
    );
    expect(migrationSql).toMatch(/Do not disable row level security/);
  });
});
