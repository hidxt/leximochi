import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LIST_PAGE_MAX, NotebookSource } from '@leximochi/types';

const SOURCE_VALUES = Object.values(NotebookSource) as string[];

export class AddNotebookDto {
  @IsString()
  @MaxLength(64)
  wordId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsIn(SOURCE_VALUES)
  source?: NotebookSource;
}

export class ListNotebookDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_PAGE_MAX)
  limit?: number;
}
