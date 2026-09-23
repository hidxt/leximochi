import { QuestionType, type SpellingErrorType } from '@leximochi/types';

export interface AnswerCheckInput {
  questionType: QuestionType;
  headword: string;
  /** 该词条的全部中文释义（任意一条算对） */
  definitions: string[];
  answer: string;
}

export interface AnswerCheckResult {
  correct: boolean;
  /** 返回给用户的标准答案（服务端权威） */
  correctAnswer: string;
}

/**
 * 拉平文本用于比较：统一 NFKC、去首尾空白、小写、去掉空白与常见标点。
 * 目的：`放弃；抛弃` 与 `放弃;抛弃`、`Abandon` 与 `abandon` 视为等价，
 * 但不做模糊匹配（不给半分、不猜意图）。
 */
export function normalizeAnswerText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[.,;:!?'"“”‘’()（）[\]{}<>、。，；：！？·~`_/\\|-]/g, '');
}

/** 选择题与英译中：命中任意一条释义即算对 */
const DEFINITION_TYPES: ReadonlySet<string> = new Set([
  QuestionType.DefinitionChoice,
  QuestionType.EnToZh,
]);

export function checkAnswer(input: AnswerCheckInput): AnswerCheckResult {
  const headword = input.headword.trim();
  if (DEFINITION_TYPES.has(input.questionType)) {
    const normalized = normalizeAnswerText(input.answer);
    const correct = input.definitions.some(
      (definition) => normalizeAnswerText(definition) === normalized && normalized.length > 0,
    );
    return { correct, correctAnswer: input.definitions[0] ?? headword };
  }
  // 中译英 / 拼写 / 听写：与词形比较
  const normalizedAnswer = normalizeAnswerText(input.answer);
  const normalizedHeadword = normalizeAnswerText(headword);
  return {
    correct: normalizedAnswer.length > 0 && normalizedAnswer === normalizedHeadword,
    correctAnswer: headword,
  };
}

function isSubsequence(shorter: string, longer: string): boolean {
  let index = 0;
  for (const char of longer) {
    if (char === shorter[index]) index += 1;
    if (index === shorter.length) return true;
  }
  return index === shorter.length;
}

function sortedChars(value: string): string {
  return [...value].sort().join('');
}

/**
 * 错拼分类（用于提高该词后续复习权重）。
 * 只做可判定的形态判断，不猜语义：
 * - 字母集合相同但顺序不同 → order_error
 * - 漏字母（输入是标准词形的子序列） → missing_letter
 * - 多字母（标准词形是输入的子序列） → duplicate_letter
 * - 等长但字母不同 → wrong_letter
 */
export function classifySpellingError(expected: string, actual: string): SpellingErrorType[] {
  const target = normalizeAnswerText(expected);
  const typed = normalizeAnswerText(actual);
  if (target.length === 0 || typed.length === 0 || target === typed) return [];

  const errors = new Set<SpellingErrorType>();
  if (sortedChars(target) === sortedChars(typed)) {
    errors.add('order_error');
  }
  if (typed.length < target.length && isSubsequence(typed, target)) {
    errors.add('missing_letter');
  }
  if (typed.length > target.length && isSubsequence(target, typed)) {
    errors.add('duplicate_letter');
  }
  if (typed.length === target.length && sortedChars(target) !== sortedChars(typed)) {
    errors.add('wrong_letter');
  }
  if (errors.size === 0) {
    // 混合型错误（既漏又多等）：按最宽泛的错误类型记录
    errors.add('wrong_letter');
  }
  return [...errors];
}
