import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { authAttempts, type AttemptKind } from '../schema';
import type {
  AuthAttemptRepository,
  CountFailuresInput,
  RecordAttemptInput,
} from '../../modules/auth/domain/auth-attempt.repository';

@Injectable()
export class DrizzleAuthAttemptRepository implements AuthAttemptRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async record(input: RecordAttemptInput): Promise<void> {
    this.database.db
      .insert(authAttempts)
      .values({
        id: input.id,
        kind: input.kind,
        usernameCanonical: input.usernameCanonical,
        ip: input.ip,
        success: input.success ? 1 : 0,
        createdAt: input.createdAt,
      })
      .run();
  }

  async countFailures(input: CountFailuresInput): Promise<number> {
    const filters = [
      eq(authAttempts.kind, input.kind),
      eq(authAttempts.success, 0),
      gte(authAttempts.createdAt, input.since),
    ];
    if (input.usernameCanonical) {
      filters.push(eq(authAttempts.usernameCanonical, input.usernameCanonical));
    }
    if (input.ip) {
      filters.push(eq(authAttempts.ip, input.ip));
    }
    const row = this.database.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(authAttempts)
      .where(and(...filters))
      .get();
    return Number(row?.count ?? 0);
  }

  async clearForUser(kind: AttemptKind, usernameCanonical: string): Promise<void> {
    this.database.sqlite
      .prepare(
        `DELETE FROM auth_attempts
         WHERE kind = ? AND username_canonical = ? AND success = 0`,
      )
      .run(kind, usernameCanonical);
  }
}
