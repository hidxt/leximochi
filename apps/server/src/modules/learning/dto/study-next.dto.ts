import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudyMode } from '@leximochi/types';

const MODE_VALUES = Object.values(StudyMode) as string[];

export class StudyNextDto {
  @IsIn(MODE_VALUES)
  mode!: StudyMode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  wordbookKey?: string;
}
