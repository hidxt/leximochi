import { QuestionType } from '@leximochi/types';
import { checkAnswer, classifySpellingError, normalizeAnswerText } from '../src/modules/learning/answer-checker';

describe('normalizeAnswerText', () => {
  it('忽略大小写、空白与常见标点（含全角）', () => {
    expect(normalizeAnswerText('  Abandon ')).toBe('abandon');
    expect(normalizeAnswerText('放弃；抛弃')).toBe(normalizeAnswerText('放弃;抛弃'));
    expect(normalizeAnswerText('放弃 抛弃')).toBe(normalizeAnswerText('放弃、抛弃'));
  });
});

describe('checkAnswer', () => {
  const base = {
    headword: 'abandon',
    definitions: ['放弃；抛弃', '放纵'],
  };

  it('拼写/中译英：与词形比较且大小写不敏感', () => {
    expect(checkAnswer({ ...base, questionType: QuestionType.Spelling, answer: ' Abandon ' })).toEqual({
      correct: true,
      correctAnswer: 'abandon',
    });
    expect(
      checkAnswer({ ...base, questionType: QuestionType.ZhToEn, answer: 'abandom' }).correct,
    ).toBe(false);
  });

  it('选择题/英译中：命中任意一条释义即算对', () => {
    expect(
      checkAnswer({ ...base, questionType: QuestionType.DefinitionChoice, answer: '放纵' }).correct,
    ).toBe(true);
    expect(
      checkAnswer({ ...base, questionType: QuestionType.EnToZh, answer: '放弃;抛弃' }).correct,
    ).toBe(true);
    expect(
      checkAnswer({ ...base, questionType: QuestionType.DefinitionChoice, answer: '忍受' }).correct,
    ).toBe(false);
  });

  it('空输入不算对（不允许空答案蒙对）', () => {
    expect(checkAnswer({ ...base, questionType: QuestionType.Spelling, answer: '   ' }).correct).toBe(false);
    expect(checkAnswer({ ...base, questionType: QuestionType.DefinitionChoice, answer: '' }).correct).toBe(false);
  });

  it('返回的标准答案来自服务端数据', () => {
    expect(
      checkAnswer({ ...base, questionType: QuestionType.DefinitionChoice, answer: 'x' }).correctAnswer,
    ).toBe('放弃；抛弃');
  });
});

describe('classifySpellingError', () => {
  it('正确拼写无错拼类型', () => {
    expect(classifySpellingError('abruptly', 'Abruptly')).toEqual([]);
  });

  it('字母顺序错误（字母集合相同但顺序不同，如 p/t 换位）', () => {
    expect(classifySpellingError('abruptly', 'aburptly')).toContain('order_error');
  });

  it('字母替换算错字母', () => {
    expect(classifySpellingError('abruptly', 'abrubtly')).toContain('wrong_letter');
  });

  it('漏字母', () => {
    expect(classifySpellingError('abruptly', 'abrptly')).toContain('missing_letter');
  });

  it('重复字母', () => {
    expect(classifySpellingError('abruptly', 'abrupptly')).toContain('duplicate_letter');
  });

  it('等长但字母不同', () => {
    expect(classifySpellingError('abruptly', 'abruptla')).toContain('wrong_letter');
  });

  it('混合型错误至少给出一个类型（不会返回空）', () => {
    expect(classifySpellingError('abruptly', 'abx').length).toBeGreaterThan(0);
  });
});
