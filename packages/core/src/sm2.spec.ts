import {
  INITIAL_SM2_STATE,
  applySm2,
  applySpellingPenalty,
  mapAnswerToRating,
  type Sm2State,
} from './sm2';

const ANSWERED_AT = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe('mapAnswerToRating', () => {
  it('答错一律映射为 again', () => {
    expect(mapAnswerToRating({ isCorrect: false, durationMs: 1000 })).toBe('again');
  });

  it('答对且用时很短映射为 easy', () => {
    expect(mapAnswerToRating({ isCorrect: true, durationMs: 2000 })).toBe('easy');
  });

  it('答对且用时正常映射为 good', () => {
    expect(mapAnswerToRating({ isCorrect: true, durationMs: 5000 })).toBe('good');
  });

  it('答对但用时过长映射为 hard', () => {
    expect(mapAnswerToRating({ isCorrect: true, durationMs: 12_000 })).toBe('hard');
  });

  it('阈值可配置', () => {
    // 放宽阈值后，同样用时变为 easy
    expect(
      mapAnswerToRating({ isCorrect: true, durationMs: 3000, fastMs: 5000, slowMs: 20000 }),
    ).toBe('easy');
    // 收紧阈值后，同样用时应判为 hard
    expect(
      mapAnswerToRating({ isCorrect: true, durationMs: 3000, fastMs: 1000, slowMs: 2000 }),
    ).toBe('hard');
  });
});

describe('applySm2', () => {
  it('初始状态为 new，难度 2.5', () => {
    expect(INITIAL_SM2_STATE).toEqual({
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      status: 'new',
    });
  });

  it('首次 good：间隔 1 天、进入 learning', () => {
    const result = applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.5);
    expect(result.status).toBe('learning');
    expect(result.dueAt).toBe(ANSWERED_AT + DAY);
  });

  it('第二次 good：间隔 6 天', () => {
    const first = applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT);
    const second = applySm2(first, 'good', ANSWERED_AT);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it('第三次 good：间隔按难度因子放大', () => {
    let state: Sm2State = INITIAL_SM2_STATE;
    for (let i = 0; i < 3; i += 1) state = applySm2(state, 'good', ANSWERED_AT);
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBe(15); // round(6 * 2.5)
  });

  it('首次 easy：间隔 3 天、难度上升', () => {
    const result = applySm2(INITIAL_SM2_STATE, 'easy', ANSWERED_AT);
    expect(result.intervalDays).toBe(3);
    expect(result.easeFactor).toBeCloseTo(2.65, 5);
    expect(result.dueAt).toBe(ANSWERED_AT + 3 * DAY);
  });

  it('首次 hard：间隔仍为 1 天、难度下降', () => {
    const result = applySm2(INITIAL_SM2_STATE, 'hard', ANSWERED_AT);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBeCloseTo(2.35, 5);
  });

  it('again：重置重复次数、记录遗忘、当天可再练', () => {
    const learned = applySm2(applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT), 'good', ANSWERED_AT);
    const failed = applySm2(learned, 'again', ANSWERED_AT);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.easeFactor).toBeCloseTo(2.3, 5);
    expect(failed.status).toBe('learning');
    expect(failed.dueAt).toBe(ANSWERED_AT + 10 * MINUTE);
  });

  it('难度因子有下限 1.3', () => {
    let state: Sm2State = INITIAL_SM2_STATE;
    for (let i = 0; i < 10; i += 1) state = applySm2(state, 'again', ANSWERED_AT);
    expect(state.easeFactor).toBe(1.3);
  });

  it('难度因子有上限 3.0', () => {
    let state: Sm2State = INITIAL_SM2_STATE;
    for (let i = 0; i < 10; i += 1) state = applySm2(state, 'easy', ANSWERED_AT);
    expect(state.easeFactor).toBe(3);
  });

  it('满足重复次数与间隔后判定为 mastered', () => {
    let state: Sm2State = INITIAL_SM2_STATE;
    for (let i = 0; i < 6; i += 1) state = applySm2(state, 'easy', ANSWERED_AT);
    expect(state.repetitions).toBeGreaterThanOrEqual(5);
    expect(state.intervalDays).toBeGreaterThanOrEqual(21);
    expect(state.status).toBe('mastered');
  });

  it('不修改传入的状态对象（纯函数）', () => {
    const before = { ...INITIAL_SM2_STATE };
    applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT);
    expect(INITIAL_SM2_STATE).toEqual(before);
  });
});

describe('applySpellingPenalty', () => {
  it('错拼类型按权重额外降低难度因子，且不低于下限', () => {
    const state = applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT);
    const penalized = applySpellingPenalty(state, ['order_error']);
    expect(penalized.easeFactor).toBeCloseTo(state.easeFactor - 0.1, 5);

    const many = applySpellingPenalty({ ...state, easeFactor: 1.35 }, [
      'order_error',
      'missing_letter',
      'duplicate_letter',
    ]);
    expect(many.easeFactor).toBe(1.3);
  });

  it('无错拼时不改变状态', () => {
    const state = applySm2(INITIAL_SM2_STATE, 'good', ANSWERED_AT);
    expect(applySpellingPenalty(state, [])).toEqual(state);
  });
});
