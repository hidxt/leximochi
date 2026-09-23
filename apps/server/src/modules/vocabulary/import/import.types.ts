/**
 * 词库导入的规范中间格式（source-agnostic）。
 *
 * 设计意图：任何外部数据源（开放词表、自制数据、后台录入）都先转换成这套结构再入库，
 * 这样导入逻辑、校验规则与幂等语义只需实现一次，且与具体来源解耦。
 * 词典数据与 AI 补充内容在结构上就是分开的：`aiNotes` 单独一段，永不会覆盖词典字段。
 */

export interface ImportWordbookInput {
  key: string;
  name: string;
  description?: string | null;
  language?: string;
  isSystem?: boolean;
}

export interface ImportSenseInput {
  partOfSpeech?: string | null;
  definitionZh: string;
  definitionEn?: string | null;
  examMeaning?: string | null;
}

export interface ImportExampleInput {
  textEn: string;
  textZh: string;
}

export interface ImportPhraseInput {
  kind?: 'phrase' | 'collocation';
  text: string;
  translation: string;
}

export interface ImportFormInput {
  formType: string;
  value: string;
}

export interface ImportRelationInput {
  relationType: 'synonym' | 'antonym' | 'confusable' | 'derived';
  targetWordId?: string | null;
  targetText?: string | null;
}

export interface ImportAiNotesInput {
  memoryTip?: string | null;
  usageNote?: string | null;
  confusableNote?: string | null;
  extraExamples?: ImportExampleInput[];
  provider?: string | null;
  model?: string | null;
}

export interface ImportWordInput {
  headword: string;
  phoneticUk?: string | null;
  phoneticUs?: string | null;
  audioUkKey?: string | null;
  audioUsKey?: string | null;
  rank?: number | null;
  tags?: string[];
  senses: ImportSenseInput[];
  examples?: ImportExampleInput[];
  phrases?: ImportPhraseInput[];
  forms?: ImportFormInput[];
  relations?: ImportRelationInput[];
  aiNotes?: ImportAiNotesInput | null;
}

export interface ImportFailure {
  index: number;
  headword: string | null;
  reason: string;
}

export interface ImportSummary {
  wordbookKey: string;
  created: number;
  updated: number;
  /** 因校验失败被跳过的词条（其余词条仍会正常导入） */
  failed: ImportFailure[];
  version: number;
  wordCount: number;
}
