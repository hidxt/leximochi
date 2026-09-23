import { randomInt, randomUUID } from 'node:crypto';
import { QuestionType, type StudyMode, type StudyQuestionDto } from '@leximochi/types';
import { normalizeAnswerText } from './answer-checker';
import type { WordDetailRecord } from '../vocabulary/domain/word.repository';

export interface BuildQuestionInput {
  word: WordDetailRecord;
  questionType: QuestionType;
  mode: StudyMode;
  /** 干扰项释义（来自其他词条），仅选择题使用 */
  distractors: string[];
  /** 选项总数（含正确答案） */
  optionCount?: number;
}

/** 无偏洗牌：避免用 Math.random 造成选项位置可预测 */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * 生成题目。**绝不包含正确答案的标记**：
 * - 输入型题目（中译英/拼写/听写）题干只给中文释义与音标，答案词形不出现在返回内容中
 * - 选择题的正确项混在选项中，但不返回「哪一项正确」的信息
 * 判定一律由服务端在提交时完成。
 */
export function buildQuestion(input: BuildQuestionInput): StudyQuestionDto {
  const { word, questionType, mode } = input;
  const primaryDefinition = word.senses[0]?.definitionZh ?? '';
  const phonetic = word.phoneticUk ?? word.phoneticUs ?? null;
  const audioKey = word.audioUkKey ?? word.audioUsKey ?? null;
  const questionId = randomUUID();

  switch (questionType) {
    case QuestionType.DefinitionChoice: {
      const optionCount = input.optionCount ?? 4;
      const seen = new Set<string>([normalizeAnswerText(primaryDefinition)]);
      const options: string[] = [primaryDefinition];
      for (const distractor of input.distractors) {
        if (options.length >= optionCount) break;
        const key = normalizeAnswerText(distractor);
        if (key.length === 0 || seen.has(key)) continue;
        seen.add(key);
        options.push(distractor);
      }
      return {
        questionId,
        wordId: word.id,
        questionType,
        mode,
        prompt: word.headword,
        phonetic,
        audioKey: null,
        options: shuffle(options),
        requiresInput: false,
      };
    }
    case QuestionType.EnToZh:
      return {
        questionId,
        wordId: word.id,
        questionType,
        mode,
        prompt: word.headword,
        phonetic: null,
        audioKey: null,
        options: [],
        requiresInput: true,
      };
    case QuestionType.ZhToEn:
      return {
        questionId,
        wordId: word.id,
        questionType,
        mode,
        prompt: primaryDefinition,
        phonetic: null,
        audioKey: null,
        options: [],
        requiresInput: true,
      };
    case QuestionType.Spelling:
      return {
        questionId,
        wordId: word.id,
        questionType,
        mode,
        prompt: primaryDefinition,
        // 拼写给音标提示：这是拼写训练而非纯回忆
        phonetic,
        audioKey: null,
        options: [],
        requiresInput: true,
      };
    case QuestionType.ListeningDictation:
      return {
        questionId,
        wordId: word.id,
        questionType,
        mode,
        prompt: '',
        phonetic: null,
        audioKey,
        options: [],
        requiresInput: true,
      };
  }
}

/**
 * 复习题的题型轮换：按词条 ID 稳定选择，保证同一词在不同用户/不同时间拿到同一题型，
 * 便于客户端缓存与结果可比；同时避免每次都出同一种题型。
 */
export function pickReviewQuestionType(wordId: string): QuestionType {
  const candidates = [QuestionType.DefinitionChoice, QuestionType.ZhToEn, QuestionType.Spelling];
  let hash = 0;
  for (const char of wordId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003;
  }
  return candidates[hash % candidates.length]!;
}

/** 该词条是否具备可用于听写的音频资源 */
export function hasAudio(word: WordDetailRecord): boolean {
  return Boolean(word.audioUkKey || word.audioUsKey);
}
