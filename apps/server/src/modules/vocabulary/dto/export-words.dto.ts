import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { WORDBOOK_EXPORT_PAGE_MAX } from '@leximochi/types';

export class ExportWordsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WORDBOOK_EXPORT_PAGE_MAX)
  limit?: number;
}
