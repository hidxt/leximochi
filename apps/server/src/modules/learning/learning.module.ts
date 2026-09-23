import { Module } from '@nestjs/common';
import { DrizzleLearningRepository } from '../../database/repositories/drizzle-learning.repository';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { LEARNING_REPOSITORY } from './domain/learning.repository';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [VocabularyModule],
  controllers: [LearningController],
  providers: [
    DrizzleLearningRepository,
    { provide: LEARNING_REPOSITORY, useExisting: DrizzleLearningRepository },
    LearningService,
  ],
  exports: [LEARNING_REPOSITORY, LearningService],
})
export class LearningModule {}
