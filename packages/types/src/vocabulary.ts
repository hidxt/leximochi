/**
 * 词汇与复习相关的共享契约。客户端与服务端共用同一套取值，
 * 但**判定与调度始终在服务端**：客户端只上报答题事实。
 */

export const QuestionType = {
  /** 释义选择（给单词选中文释义） */
  DefinitionChoice: 'definition_choice',
  /** 英译中（输入或选择中文） */
  EnToZh: 'en_to_zh',
  /** 中译英（给中文写英文） */
  ZhToEn: 'zh_to_en',
  /** 拼写（给中文/音标拼写英文单词） */
  Spelling: 'spelling',
  /** 听写（播放发音后输入英文） */
  ListeningDictation: 'listening_dictation',
} as const;

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

const QUESTION_TYPES: ReadonlySet<string> = new Set(Object.values(QuestionType));

export function isQuestionType(value: string): value is QuestionType {
  return QUESTION_TYPES.has(value);
}

export const StudyMode = {
  /** 新词学习（卡片式首学） */
  New: 'new',
  /** 到期复习 */
  Review: 'review',
  /** 独立拼写训练 */
  Spelling: 'spelling',
  /** 独立听写训练 */
  Dictation: 'dictation',
} as const;

export type StudyMode = (typeof StudyMode)[keyof typeof StudyMode];

const STUDY_MODES: ReadonlySet<string> = new Set(Object.values(StudyMode));

export function isStudyMode(value: string): value is StudyMode {
  return STUDY_MODES.has(value);
}

export const ReviewRating = {
  Again: 'again',
  Hard: 'hard',
  Good: 'good',
  Easy: 'easy',
} as const;

export type ReviewRating = (typeof ReviewRating)[keyof typeof ReviewRating];

export const WordStatus = {
  New: 'new',
  Learning: 'learning',
  Review: 'review',
  Mastered: 'mastered',
} as const;

export type WordStatus = (typeof WordStatus)[keyof typeof WordStatus];

export const SpellingErrorType = {
  MissingLetter: 'missing_letter',
  DuplicateLetter: 'duplicate_letter',
  OrderError: 'order_error',
  WrongLetter: 'wrong_letter',
} as const;

export type SpellingErrorType = (typeof SpellingErrorType)[keyof typeof SpellingErrorType];

const SPELLING_ERROR_TYPES: ReadonlySet<string> = new Set(Object.values(SpellingErrorType));

export function isSpellingErrorType(value: string): value is SpellingErrorType {
  return SPELLING_ERROR_TYPES.has(value);
}

export const AccentVariant = {
  Uk: 'uk',
  Us: 'us',
} as const;

export type AccentVariant = (typeof AccentVariant)[keyof typeof AccentVariant];

/** 学习内容来源：词典数据与 AI 生成内容必须可区分 */
export const ContentSource = {
  Dictionary: 'dictionary',
  Imported: 'imported',
  Ai: 'ai',
  User: 'user',
} as const;

export type ContentSource = (typeof ContentSource)[keyof typeof ContentSource];

// ---------- 词库 ----------

export interface WordbookSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  language: string;
  version: number;
  wordCount: number;
  isSystem: boolean;
}

export interface WordbookVersionInfo {
  key: string;
  version: number;
  wordCount: number;
  updatedAt: number;
}

/** 离线导出的单个词条（供 Android 下载词库后离线学习） */
export interface WordExportEntry {
  id: string;
  headword: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  /** 音频存储 key；客户端通过鉴权接口换取可播放地址 */
  audioUkKey: string | null;
  audioUsKey: string | null;
  rank: number | null;
  tags: string[];
  senses: WordSenseDto[];
  examples: WordExampleDto[];
  phrases: WordPhraseDto[];
  forms: WordFormDto[];
  relations: WordRelationDto[];
}

export interface WordPage {
  items: WordExportEntry[];
  nextCursor: string | null;
}

// ---------- 词条详情 ----------

export interface WordSenseDto {
  id: string;
  partOfSpeech: string | null;
  definitionZh: string;
  definitionEn: string | null;
  examMeaning: string | null;
}

export interface WordExampleDto {
  id: string;
  textEn: string;
  textZh: string;
  audioKey: string | null;
}

export interface WordPhraseDto {
  id: string;
  kind: 'phrase' | 'collocation';
  text: string;
  translation: string;
}

export interface WordFormDto {
  id: string;
  formType: string;
  value: string;
}

export const WordRelationType = {
  Synonym: 'synonym',
  Antonym: 'antonym',
  Confusable: 'confusable',
  /** 同根/派生词（如 abrupt → abruptly / abruptness） */
  Derived: 'derived',
} as const;

export type WordRelationType = (typeof WordRelationType)[keyof typeof WordRelationType];

export const WORD_RELATION_TYPES: readonly WordRelationType[] = Object.values(WordRelationType);

export interface WordRelationDto {
  id: string;
  relationType: WordRelationType;
  targetWordId: string | null;
  targetText: string | null;
}

/** AI 补充内容：独立于词典数据，永不覆盖词典字段 */
export interface WordAiNotesDto {
  memoryTip: string | null;
  usageNote: string | null;
  confusableNote: string | null;
  extraExamples: Array<{ textEn: string; textZh: string }>;
  provider: string | null;
  model: string | null;
  generatedAt: number | null;
}

export interface WordDetail {
  id: string;
  headword: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  audioUkKey: string | null;
  audioUsKey: string | null;
  source: ContentSource;
  senses: WordSenseDto[];
  examples: WordExampleDto[];
  phrases: WordPhraseDto[];
  forms: WordFormDto[];
  relations: WordRelationDto[];
  aiNotes: WordAiNotesDto | null;
  /** 当前用户的该词状态；未登录或从未学过为 null */
  state: WordStateDto | null;
}

export interface WordStateDto {
  status: WordStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: number | null;
  lastReviewedAt: number | null;
  totalReviews: number;
  correctReviews: number;
}

// ---------- 学习与复习 ----------

/** 下发的题目：**不包含正确答案** */
export interface StudyQuestionDto {
  questionId: string;
  wordId: string;
  questionType: QuestionType;
  mode: StudyMode;
  /** 题干（单词 / 中文释义 / 提示等） */
  prompt: string;
  /** 音标提示，可为空 */
  phonetic: string | null;
  /** 音频 key（听写题必有；无音频时该题型不出现） */
  audioKey: string | null;
  /** 选择题选项（已乱序）；非选择题为空数组 */
  options: string[];
  /** 是否需要用户输入文本 */
  requiresInput: boolean;
}

export interface StudyProgressDto {
  newRemaining: number;
  dueRemaining: number;
  learnedToday: number;
  reviewedToday: number;
  dailyNewTarget: number;
}

export interface StudyNextResponse {
  question: StudyQuestionDto | null;
  progress: StudyProgressDto;
  /** 无法出题时的明确原因（如「当前词库没有音频资源，听写暂不可用」），禁止静默返回空 */
  notice: string | null;
}

export interface StudyNextRequest {
  mode: StudyMode;
  wordbookKey?: string;
}

export interface SubmitReviewRequest {
  /** 客户端生成的全局唯一幂等键：重复提交不得重复更新学习状态 */
  eventId: string;
  wordId: string;
  questionType: QuestionType;
  /** 用户原始输入（文本或选项内容） */
  answer: string;
  durationMs: number;
  /** 客户端时间，仅供分析，不作为业务判定依据 */
  clientAnsweredAt?: number;
}

export interface SubmitReviewResponse {
  correct: boolean;
  correctAnswer: string;
  rating: ReviewRating;
  state: WordStateDto;
  /** 本次答题涉及的错拼分类（拼写/听写题） */
  spellingErrors: SpellingErrorType[];
}

export interface ReviewHistoryItem {
  id: string;
  wordId: string;
  headword: string;
  questionType: QuestionType;
  isCorrect: boolean;
  rating: ReviewRating;
  durationMs: number;
  answeredAt: number;
}

export interface ReviewHistoryPage {
  items: ReviewHistoryItem[];
  nextCursor: string | null;
}

export interface ReviewStats {
  learnedToday: number;
  reviewedToday: number;
  correctToday: number;
  accuracyToday: number | null;
  averageDurationMsToday: number | null;
  masteredWords: number;
  learningWords: number;
  notebookCount: number;
  /** 近 7 日（含今日）的每日学习量，按 UTC 日期分组 */
  dailyTrend: Array<{ date: string; newWords: number; reviews: number }>;
}

// ---------- 错拼清单（拼写/听写训练反馈） ----------

export interface SpellingErrorSummaryItem {
  wordId: string;
  headword: string;
  /** 最近一次的错误输入（供用户回看自己错在哪） */
  lastActual: string;
  /** 各类错拼累计次数 */
  errorCounts: Record<SpellingErrorType, number>;
  totalCount: number;
  firstAt: number;
  lastAt: number;
}

export interface SpellingErrorSummary {
  items: SpellingErrorSummaryItem[];
  total: number;
}

// ---------- 生词本 ----------

export const NotebookSource = {
  Manual: 'manual',
  FromReview: 'from_review',
  FromListening: 'from_listening',
} as const;

export type NotebookSource = (typeof NotebookSource)[keyof typeof NotebookSource];

export interface NotebookEntry {
  wordId: string;
  headword: string;
  /** 首条中文释义，便于列表展示 */
  definitionZh: string | null;
  note: string | null;
  source: NotebookSource;
  addedAt: number;
}

export interface NotebookPage {
  items: NotebookEntry[];
  nextCursor: string | null;
}

export interface NotebookAddResponse {
  entry: NotebookEntry;
  /** false 表示该词已在生词本中（幂等命中，不重复写入） */
  created: boolean;
}
