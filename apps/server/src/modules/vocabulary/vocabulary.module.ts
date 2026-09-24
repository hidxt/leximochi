import { Module } from '@nestjs/common';
import { DrizzleWordRepository } from '../../database/repositories/drizzle-word.repository';
import { DrizzleWordbookRepository } from '../../database/repositories/drizzle-wordbook.repository';
import { WORD_REPOSITORY } from './domain/word.repository';
import { WORDBOOK_REPOSITORY } from './domain/wordbook.repository';
import { WordImportService } from './import/word-import.service';
import { VocabularyController } from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';
import { WordWriteService } from './word-write.service';

@Module({
  controllers: [VocabularyController],
  providers: [
    DrizzleWordbookRepository,
    DrizzleWordRepository,
    { provide: WORDBOOK_REPOSITORY, useExisting: DrizzleWordbookRepository },
    { provide: WORD_REPOSITORY, useExisting: DrizzleWordRepository },
    VocabularyService,
    WordImportService,
    WordWriteService,
  ],
  exports: [
    WORDBOOK_REPOSITORY,
    WORD_REPOSITORY,
    VocabularyService,
    WordImportService,
    WordWriteService,
  ],
})
export class VocabularyModule {}
