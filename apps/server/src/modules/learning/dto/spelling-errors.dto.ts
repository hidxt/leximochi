import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { LIST_PAGE_MAX } from '@leximochi/types';

export class SpellingErrorsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_PAGE_MAX)
  limit?: number;
}
