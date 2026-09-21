import { Global, Module } from '@nestjs/common';
import { DrizzleAuditRepository } from '../../database/repositories/drizzle-audit.repository';
import { AuditService } from './audit.service';
import { AUDIT_REPOSITORY } from './domain/audit.repository';

@Global()
@Module({
  providers: [DrizzleAuditRepository, { provide: AUDIT_REPOSITORY, useExisting: DrizzleAuditRepository }, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
