import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ApiClient } from '@leximochi/api-client';
import type { StudyMode, StudyNextResponse, SubmitReviewResponse } from '@leximochi/types';
import { Notice } from '../components/Notice';
import { TianGrid } from '../components/TianGrid';

interface StudyPageProps {
  api: ApiClient;
}

const MODE_LABEL: Record<StudyMode, string> = {
  new: '新词学习',
  review: '到期复习',
  spelling: '拼写训练',
  dictation: '听写训练',
};

const MODES: ReadonlySet<string> = new Set(Object.keys(MODE_LABEL));

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 练习流：一题一屏。
 * 客户端只上报答题事实（题目类型、原始答案、用时、幂等键），
 * 对错判定与调度全部由服务端返回，界面只负责呈现结果与下一题。
 */
export function StudyPage({ api }: StudyPageProps): ReactElement | null {
  const [params] = useSearchParams();
  const modeParam = params.get('mode') ?? 'new';
  const mode = (MODES.has(modeParam) ? modeParam : 'new') as StudyMode;
  const wordbookKey = params.get('book') ?? undefined;

  const [payload, setPayload] = useState<StudyNextResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<SubmitReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedToNotebook, setSavedToNotebook] = useState(false);
  const [solved, setSolved] = useState(0);

  const eventIdRef = useRef<string>(newEventId());
  const startedAtRef = useRef<number>(Date.now());

  const loadNext = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setAnswer('');
    setSavedToNotebook(false);
    try {
      const next = await api.review.next({ mode, wordbookKey });
      setPayload(next);
      eventIdRef.current = newEventId();
      startedAtRef.current = Date.now();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, [api, mode, wordbookKey]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const question = payload?.question ?? null;

  async function handleSubmit(): Promise<void> {
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      const submitted = await api.review.submit({
        eventId: eventIdRef.current,
        wordId: question.wordId,
        questionType: question.questionType,
        answer,
        durationMs: Math.max(0, Date.now() - startedAtRef.current),
      });
      setResult(submitted);
      setSolved((count) => count + 1);
      // 服务端返回的进度是「取题时」的快照，这里只做一处确定性的本地增量：
      // totalReviews === 1 说明这是该词的首次学习，今日新学 +1。
      if (submitted.state.totalReviews === 1) {
        setPayload((current) =>
          current
            ? { ...current, progress: { ...current.progress, learnedToday: current.progress.learnedToday + 1 } }
            : current,
        );
      }
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToNotebook(): Promise<void> {
    if (!question) return;
    try {
      await api.notebook.add({ wordId: question.wordId, source: 'from_review' });
      setSavedToNotebook(true);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  if (payload && !question) {
    return (
      <section className="card">
        <span className="seal">{MODE_LABEL[mode]}</span>
        <h1 className="title" style={{ fontSize: 24 }}>
          这一轮先到这里
        </h1>
        {payload.notice ? <Notice>{payload.notice}</Notice> : <p className="subtitle">当前没有需要练习的内容。</p>}
        <Progress progress={payload.progress} solved={solved} mode={mode} />
        <div className="button-row">
          <Link className="button button--primary" to="/words">
            回到单词
          </Link>
          <Link className="button button--quiet" to="/stats">
            看学习统计
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="card practice">
      <div>
        <span className="seal">{MODE_LABEL[mode]}</span>
        <p className="practice__prompt">{promptLabel(question?.questionType)}</p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {question === null ? (
        <p className="mono">正在出题…</p>
      ) : (
        <>
          <TianGrid
            text={question.prompt}
            variant={question.requiresInput && result ? 'answer' : 'prompt'}
            stamp={result ? result.correct : null}
          />

          {question.phonetic ? <p className="practice__phonetic">{question.phonetic}</p> : null}

          {question.questionType === 'listening_dictation' ? (
            <Notice>
              {question.audioKey
                ? '这一题需要音频，音频播放将在听力阶段（Phase 4）接入；现在可以先用音标拼写。'
                : '这一题没有可播放的音频，先用音标拼写。'}
            </Notice>
          ) : null}

          {question.options.length > 0 ? (
            <div className="options">
              {question.options.map((option) => {
                const picked = answer === option;
                const mark = result
                  ? option === result.correctAnswer
                    ? ' option--correct'
                    : picked
                      ? ' option--wrong'
                      : ''
                  : picked
                    ? ' option--picked'
                    : '';
                return (
                  <button
                    key={option}
                    type="button"
                    className={`option${mark}`}
                    disabled={Boolean(result) || busy}
                    onClick={() => setAnswer(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="answer-row">
              <label className="field">
                <span className="field__label">你的答案</span>
                <input
                  id="study-answer"
                  name="answer"
                  className="field__input answer-input"
                  value={answer}
                  disabled={Boolean(result)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void (result ? loadNext() : handleSubmit());
                  }}
                />
              </label>
            </div>
          )}

          {result ? (
            <div className="stack">
              <Notice tone={result.correct ? 'success' : 'error'}>
                {result.correct
                  ? '答对了。'
                  : `正确答案：${result.correctAnswer}${
                      result.spellingErrors.length > 0
                        ? ` · 错拼类型：${result.spellingErrors.map(spellingLabel).join('、')}`
                        : ''
                    }`}
              </Notice>
              <p className="field__hint">
                该词状态：{statusLabel(result.state.status)} · 复习次数 {result.state.totalReviews} ·
                正确 {result.state.correctReviews} · 下次到期 {formatDate(result.state.dueAt)}
              </p>
            </div>
          ) : null}

          <Progress progress={payload?.progress ?? null} solved={solved} mode={mode} />

          <div className="button-row">
            {result ? (
              <>
                <button className="button button--primary" type="button" disabled={busy} onClick={() => void loadNext()}>
                  下一题
                </button>
                {!result.correct && !savedToNotebook ? (
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => void handleAddToNotebook()}
                  >
                    加入生词本
                  </button>
                ) : null}
                {savedToNotebook ? <span className="field__hint">已加入生词本</span> : null}
              </>
            ) : (
              <button
                className="button button--primary"
                type="button"
                disabled={busy || answer.trim().length === 0}
                onClick={() => void handleSubmit()}
              >
                提交答案
              </button>
            )}
            <Link className="button button--quiet" to="/words">
              结束本轮
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Progress({
  progress,
  solved,
  mode,
}: {
  progress: StudyNextResponse['progress'] | null;
  solved: number;
  mode: StudyMode;
}): ReactElement | null {
  if (!progress) return null;
  const target = mode === 'new' ? progress.dailyNewTarget : Math.max(progress.dueRemaining, 1);
  const done = mode === 'new' ? progress.learnedToday : solved;
  const slots = Math.min(Math.max(target, done, 1), 30);

  return (
    <div className="stack">
      <p className="section-label">本轮进度</p>
      <div className="marks" aria-label={`已完成 ${done} / 目标 ${target}`}>
        {Array.from({ length: slots }, (_, index) => (
          <span key={index} className={`mark${index < done ? ' mark--done' : ''}`} />
        ))}
      </div>
      <p className="field__hint">
        今日新词 {progress.learnedToday}/{progress.dailyNewTarget} · 今日复习 {progress.reviewedToday} ·
        待复习 {progress.dueRemaining} · 本词库未学 {progress.newRemaining}
      </p>
    </div>
  );
}

function promptLabel(questionType: string | undefined): string {
  switch (questionType) {
    case 'definition_choice':
      return '选出正确的中文释义';
    case 'en_to_zh':
      return '写出这个词的中文意思';
    case 'zh_to_en':
      return '根据中文写出英文单词';
    case 'spelling':
      return '根据释义与音标拼写单词';
    case 'listening_dictation':
      return '听音写词';
    default:
      return '开始练习';
  }
}

function spellingLabel(type: string): string {
  switch (type) {
    case 'missing_letter':
      return '漏字母';
    case 'duplicate_letter':
      return '多字母';
    case 'order_error':
      return '字母顺序错误';
    case 'wrong_letter':
      return '字母写错';
    default:
      return type;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'new':
      return '未学';
    case 'learning':
      return '学习中';
    case 'review':
      return '复习中';
    case 'mastered':
      return '已掌握';
    default:
      return status;
  }
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
