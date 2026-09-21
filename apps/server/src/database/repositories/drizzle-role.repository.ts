import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database.constants';
import type { DatabaseService } from '../database.service';
import { roles, userRoles } from '../schema';
import type { RoleRecord, RoleRepository } from '../../modules/users/domain/role.repository';

@Injectable()
export class DrizzleRoleRepository implements RoleRepository {
  constructor(@Inject(DATABASE) private readonly database: DatabaseService) {}

  async findByKey(key: string): Promise<RoleRecord | null> {
    const row = this.database.db.select().from(roles).where(eq(roles.key, key)).get();
    return row ? { id: row.id, key: row.key } : null;
  }

  async assignRole(
    userId: string,
    roleId: string,
    ctx: { grantedBy: string | null; now: number },
  ): Promise<void> {
    this.database.db
      .insert(userRoles)
      .values({ userId, roleId, grantedAt: ctx.now, grantedBy: ctx.grantedBy })
      .onConflictDoNothing()
      .run();
  }

  async hasRole(userId: string, roleKey: string): Promise<boolean> {
    const row = this.database.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.key, roleKey)))
      .get();
    return Boolean(row);
  }
}
