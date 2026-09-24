import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { AdminVocabularyController } from './admin-vocabulary.controller';
import { AdminVocabularyService } from './admin-vocabulary.service';

/** 管理后台的词库/词条管理：复用词库读模型与写入服务，权限由服务端逐接口校验 */
@Module({
  imports: [VocabularyModule, AuditModule],
  controllers: [AdminVocabularyController],
  providers: [AdminVocabularyService],
})
export class AdminVocabularyModule {}
