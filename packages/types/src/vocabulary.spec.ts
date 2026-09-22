import { ErrorCode, isErrorCode } from './error-code';
import {
  AUDIO_ALLOWED_EXTENSIONS,
  AUDIO_MAX_BYTES,
  DEFAULT_DAILY_NEW_TARGET,
  WORD_IMPORT_MAX_ITEMS,
  WORDBOOK_EXPORT_PAGE_MAX,
} from './limits';
import {
  AccentVariant,
  ContentSource,
  QuestionType,
  ReviewRating,
  SpellingErrorType,
  StudyMode,
  WordStatus,
  isQuestionType,
  isStudyMode,
} from './vocabulary';

describe('题型与学习模式', () => {
  it('暴露五种题型', () => {
    expect(Object.values(QuestionType)).toEqual([
      'definition_choice',
      'en_to_zh',
      'zh_to_en',
      'spelling',
      'listening_dictation',
    ]);
  });

  it('isQuestionType 只接受已知题型', () => {
    expect(isQuestionType('spelling')).toBe(true);
    expect(isQuestionType('listening_dictation')).toBe(true);
    expect(isQuestionType('essay')).toBe(false);
  });

  it('isStudyMode 只接受已知模式', () => {
    expect(Object.values(StudyMode)).toEqual(['new', 'review', 'spelling', 'dictation']);
    expect(isStudyMode('review')).toBe(true);
    expect(isStudyMode('listening')).toBe(false);
  });

  it('评分、状态、错拼类型与来源取值稳定（客户端与服务端共用）', () => {
    expect(Object.values(ReviewRating)).toEqual(['again', 'hard', 'good', 'easy']);
    expect(Object.values(WordStatus)).toEqual(['new', 'learning', 'review', 'mastered']);
    expect(Object.values(SpellingErrorType)).toEqual([
      'missing_letter',
      'duplicate_letter',
      'order_error',
      'wrong_letter',
    ]);
    expect(Object.values(AccentVariant)).toEqual(['uk', 'us']);
    expect(Object.values(ContentSource)).toEqual(['dictionary', 'imported', 'ai', 'user']);
  });
});

describe('Phase 2 错误码', () => {
  it('包含词汇、上传与导入相关错误码', () => {
    for (const code of [
      'WORDBOOK_NOT_FOUND',
      'WORDBOOK_KEY_TAKEN',
      'WORD_NOT_FOUND',
      'NOTEBOOK_ENTRY_NOT_FOUND',
      'STUDY_CONTENT_EXHAUSTED',
      'REVIEW_EVENT_CONFLICT',
      'QUESTION_MISMATCH',
      'UNSUPPORTED_MEDIA_TYPE',
      'PAYLOAD_TOO_LARGE',
      'IMPORT_PAYLOAD_INVALID',
    ]) {
      expect(isErrorCode(code)).toBe(true);
    }
    expect(ErrorCode.UNSUPPORTED_MEDIA_TYPE).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('Phase 2 限额常量', () => {
  it('音频上传限制明确且保守', () => {
    expect(AUDIO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect([...AUDIO_ALLOWED_EXTENSIONS]).toEqual(['.mp3', '.m4a', '.ogg']);
  });

  it('分页与导入上限明确', () => {
    expect(WORDBOOK_EXPORT_PAGE_MAX).toBe(200);
    expect(WORD_IMPORT_MAX_ITEMS).toBe(500);
    expect(DEFAULT_DAILY_NEW_TARGET).toBeGreaterThan(0);
  });
});
