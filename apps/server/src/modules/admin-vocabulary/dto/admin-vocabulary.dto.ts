import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  LIST_PAGE_MAX,
  WORD_IMPORT_MAX_ITEMS,
  WORD_RELATION_TYPES,
  type WordRelationType,
} from '@leximochi/types';

const RELATION_TYPES = [...WORD_RELATION_TYPES] as string[];

/** 词库 key：仅小写字母/数字/下划线/短横线，便于作为离线目录名与配置键 */
const WORDBOOK_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export class CreateWordbookDto {
  @IsString()
  @Matches(WORDBOOK_KEY_PATTERN, { message: 'key 只能包含小写字母、数字、下划线或短横线（2–32 位）' })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}

export class UpdateWordbookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}

/** 高风险操作（删除词库/词条）必须显式二次确认 */
export class ConfirmDto {
  @IsBoolean()
  confirm!: boolean;
}

export class WordSenseDtoInput {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  partOfSpeech?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  definitionZh!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  definitionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  examMeaning?: string;
}

export class WordExampleDtoInput {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  textEn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  textZh!: string;
}

export class WordPhraseDtoInput {
  @IsOptional()
  @IsIn(['phrase', 'collocation'])
  kind?: 'phrase' | 'collocation';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  translation!: string;
}

export class WordFormDtoInput {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  formType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  value!: string;
}

export class WordRelationDtoInput {
  @IsIn(RELATION_TYPES)
  relationType!: WordRelationType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetWordId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetText?: string;
}

export class WordAiNotesDtoInput {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  memoryTip?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  usageNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  confusableNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;
}

/** 词条内容（创建与更新共用）；`rank`/`tags` 只在创建时影响词库内位置 */
export class WordContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  headword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneticUk?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneticUs?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  rank?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  tags?: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WordSenseDtoInput)
  senses!: WordSenseDtoInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => WordExampleDtoInput)
  examples?: WordExampleDtoInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WordPhraseDtoInput)
  phrases?: WordPhraseDtoInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WordFormDtoInput)
  forms?: WordFormDtoInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WordRelationDtoInput)
  relations?: WordRelationDtoInput[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WordAiNotesDtoInput)
  aiNotes?: WordAiNotesDtoInput;
}

export class CreateWordDto extends WordContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  wordbookId!: string;
}

export class ListAdminWordsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  wordbookId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_PAGE_MAX)
  limit?: number;
}

export class ImportWordsDto {
  @IsString()
  @Matches(WORDBOOK_KEY_PATTERN, { message: 'key 只能包含小写字母、数字、下划线或短横线（2–32 位）' })
  wordbookKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  wordbookName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /** 逐条语义校验由 WordImportService 完成，失败项会带下标返回而不影响其余词条 */
  @IsArray()
  @ArrayMaxSize(WORD_IMPORT_MAX_ITEMS)
  @IsObject({ each: true })
  items!: Array<Record<string, unknown>>;
}

export class UploadAudioDto {
  @IsIn(['uk', 'us'])
  kind!: 'uk' | 'us';
}
