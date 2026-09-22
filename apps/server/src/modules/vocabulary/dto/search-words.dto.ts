import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchWordsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  wordbookKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
