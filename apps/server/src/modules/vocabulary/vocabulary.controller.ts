import { Controller, Get, Param, Query } from '@nestjs/common';
import type { WordDetail, WordPage, WordbookSummary, WordbookVersionInfo } from '@leximochi/types';
import { CurrentUser, type AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ExportWordsDto } from './dto/export-words.dto';
import { SearchWordsDto } from './dto/search-words.dto';
import { VocabularyService } from './vocabulary.service';
import type { WordSearchItem } from './domain/word.repository';

@Controller()
export class VocabularyController {
  constructor(private readonly vocabulary: VocabularyService) {}

  @Get('wordbooks')
  async listWordbooks(): Promise<{ data: WordbookSummary[] }> {
    return { data: await this.vocabulary.listWordbooks() };
  }

  @Get('wordbooks/:key/version')
  async wordbookVersion(@Param('key') key: string): Promise<{ data: WordbookVersionInfo }> {
    return { data: await this.vocabulary.getVersion(key) };
  }

  @Get('wordbooks/:key/words')
  async exportWords(
    @Param('key') key: string,
    @Query() query: ExportWordsDto,
  ): Promise<{ data: WordPage }> {
    return { data: await this.vocabulary.exportWords(key, query) };
  }

  // 注意：必须声明在 'words/:id' 之前，否则 'search' 会被当作 id 匹配
  @Get('words/search')
  async searchWords(@Query() query: SearchWordsDto): Promise<{ data: WordSearchItem[] }> {
    return { data: await this.vocabulary.searchWords(query) };
  }

  @Get('words/:id')
  async wordDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: WordDetail }> {
    return { data: await this.vocabulary.getWordDetail(id, user.userId) };
  }
}
