import { Module } from '@nestjs/common';
import { DrizzleLearningRepository } from '../../database/repositories/drizzle-learning.repository';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { LEARNING_REPOSITORY } from './domain/learning.repository';
import { LearningController } from './learning.controller';
import { StudyController } from './study.controller';
import { LearningService } from './learning.service';
import { StudyService } from './study.service';

@Module({
  imports: [VocabularyModule],
  controllers: [LearningController, StudyController],
  providers: [
    DrizzleLearningRepository,
    { provide: LEARNING_REPOSITORY, useExisting: DrizzleLearningRepository },
    LearningService,
    StudyService,
  ],
  exports: [LEARNING_REPOSITORY, LearningService, StudyService],
})
export class LearningModule {}
