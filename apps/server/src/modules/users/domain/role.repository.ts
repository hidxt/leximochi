export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';

export interface RoleRecord {
  id: string;
  key: string;
}

export interface RoleRepository {
  findByKey(key: string): Promise<RoleRecord | null>;
  assignRole(
    userId: string,
    roleId: string,
    ctx: { grantedBy: string | null; now: number },
  ): Promise<void>;
}
