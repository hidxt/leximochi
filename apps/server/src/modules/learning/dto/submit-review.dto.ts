import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { QuestionType } from '@leximochi/types';

const QUESTION_TYPE_VALUES = Object.values(QuestionType) as string[];

export class SubmitReviewDto {
  /** 幂等键：由客户端生成，重试/离线补传必须复用同一个值 */
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  eventId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  wordId!: string;

  @IsIn(QUESTION_TYPE_VALUES)
  questionType!: QuestionType;

  @IsString()
  @MaxLength(200)
  answer!: string;

  /** 答题用时（毫秒）：只用于映射评分，最终评分由服务端决定 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600_000)
  durationMs!: number;

  /** 客户端时间：仅作分析记录，不参与业务判定 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  clientAnsweredAt?: number;
}
