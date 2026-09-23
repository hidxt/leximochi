import { Module } from '@nestjs/common';
import { DrizzleLearningRepository } from '../../database/repositories/drizzle-learning.repository';
import { DrizzleNotebookRepository } from '../../database/repositories/drizzle-notebook.repository';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { LEARNING_REPOSITORY } from './domain/learning.repository';
import { NOTEBOOK_REPOSITORY } from './domain/notebook.repository';
import { LearningController } from './learning.controller';
import { NotebookController } from './notebook.controller';
import { StudyController } from './study.controller';
import { LearningService } from './learning.service';
import { NotebookService } from './notebook.service';
import { StudyService } from './study.service';

@Module({
  imports: [VocabularyModule],
  controllers: [LearningController, StudyController, NotebookController],
  providers: [
    DrizzleLearningRepository,
    { provide: LEARNING_REPOSITORY, useExisting: DrizzleLearningRepository },
    DrizzleNotebookRepository,
    { provide: NOTEBOOK_REPOSITORY, useExisting: DrizzleNotebookRepository },
    LearningService,
    StudyService,
    NotebookService,
  ],
  exports: [LEARNING_REPOSITORY, NOTEBOOK_REPOSITORY, LearningService, StudyService, NotebookService],
})
export class LearningModule {}
