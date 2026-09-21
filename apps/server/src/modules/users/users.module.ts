import { Module } from '@nestjs/common';
import {
  DrizzleRecoveryCodeRepository,
} from '../../database/repositories/drizzle-recovery-code.repository';
import { DrizzleRoleRepository } from '../../database/repositories/drizzle-role.repository';
import { DrizzleUserRepository } from '../../database/repositories/drizzle-user.repository';
import { RECOVERY_CODE_REPOSITORY } from './domain/recovery-code.repository';
import { ROLE_REPOSITORY } from './domain/role.repository';
import { USER_REPOSITORY } from './domain/user.repository';

@Module({
  providers: [
    DrizzleUserRepository,
    DrizzleRecoveryCodeRepository,
    DrizzleRoleRepository,
    { provide: USER_REPOSITORY, useExisting: DrizzleUserRepository },
    { provide: RECOVERY_CODE_REPOSITORY, useExisting: DrizzleRecoveryCodeRepository },
    { provide: ROLE_REPOSITORY, useExisting: DrizzleRoleRepository },
  ],
  exports: [USER_REPOSITORY, RECOVERY_CODE_REPOSITORY, ROLE_REPOSITORY],
})
export class UsersModule {}
