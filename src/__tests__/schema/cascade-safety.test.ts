/**
 * Tests for Prisma schema cascade safety (B1.3, B3.1, C1.3)
 */
import fs from 'fs';
import path from 'path';

describe('Prisma schema cascade safety', () => {
  let schema: string;

  beforeAll(() => {
    schema = fs.readFileSync(
      path.join(process.cwd(), 'prisma/schema.prisma'),
      'utf-8'
    );
  });

  it('AuditLog admin relation has no cascade delete (B1.3)', () => {
    // Extract the AuditLog model block
    const auditLogMatch = schema.match(/model AuditLog \{[\s\S]*?\n\}/);
    expect(auditLogMatch).toBeTruthy();
    const auditLogBlock = auditLogMatch![0];

    // The admin relation line should NOT contain onDelete: Cascade
    const adminLine = auditLogBlock
      .split('\n')
      .find((line) => line.includes('admin') && line.includes('User'));
    expect(adminLine).toBeDefined();
    expect(adminLine).not.toContain('onDelete: Cascade');
  });

  it('IdempotencyKey userId has no cascade relation (B3.1)', () => {
    const idempotencyMatch = schema.match(
      /model IdempotencyKey \{[\s\S]*?\n\}/
    );
    expect(idempotencyMatch).toBeTruthy();
    const idempotencyBlock = idempotencyMatch![0];

    // userId should be a plain String field, not a relation with cascade
    const userIdLine = idempotencyBlock
      .split('\n')
      .find((line) => line.trim().startsWith('userId'));
    expect(userIdLine).toBeDefined();
    expect(userIdLine).not.toContain('onDelete');
    // Should NOT have a @relation directive on userId
    expect(userIdLine).not.toContain('@relation');
  });

  it('Message has composite index on [conversationId, createdAt] (C1.3)', () => {
    const messageMatch = schema.match(/model Message \{[\s\S]*?\n\}/);
    expect(messageMatch).toBeTruthy();
    const messageBlock = messageMatch![0];

    // Should have @@index([conversationId, createdAt])
    expect(messageBlock).toMatch(
      /@@index\(\[conversationId,\s*createdAt\]\)/
    );
  });
});
