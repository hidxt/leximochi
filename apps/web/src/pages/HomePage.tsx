import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '@leximochi/api-client';
import type { MeResponse, ReviewStats, StudyMode, WordbookSummary } from '@leximochi/types';
import { Notice } from '../components/Notice';

interface HomePageProps {
  api: ApiClient;
  me: MeResponse;
}

const TASKS: Array<{ mode: StudyMode; title: string; hint: string }> = [
  { mode: 'new', title: '学新词', hint: '按词库顺序推进' },
  { mode: 'review', title: '到期复习', hint: '先消化到期的词' },
  { mode: 'spelling', title: '拼写', hint: '动手写一遍' },
  { mode: 'dictation', title: '听写', hint: '听音写词' },
];

/** 首页：今日学习任务 + 快捷开始（宠物状态在左侧常驻显示） */
export function HomePage({ api, me }: HomePageProps): ReactElement {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [books, setBooks] = useState<WordbookSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [current, wordbooks] = await Promise.all([
        api.review.stats(),
        api.vocabulary.listWordbooks(),
      ]);
      setStats(current);
      setBooks(wordbooks);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const primaryBook = books[0]?.key;
  const bookQuery = primaryBook ? `&book=${encodeURIComponent(primaryBook)}` : '';

  return (
    <>
      <section className="card">
        <span className="seal">今日</span>
        <h1 className="title">
          {greeting()}，{me.user.username}
        </h1>
        <p className="subtitle">
          {stats === null
            ? '正在读取今天的学习进度…'
            : stats.learnedToday === 0 && stats.reviewedToday === 0
              ? '今天还没有开始，先学几个新词吧。'
              : `今天已学 ${stats.learnedToday} 个新词、复习 ${stats.reviewedToday} 次。`}
        </p>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {stats ? (
          <div className="tally">
            <div className="tally__cell">
              <div className="tally__value">{stats.learnedToday}</div>
              <div className="tally__label">今日新学</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">{stats.reviewedToday}</div>
              <div className="tally__label">今日复习</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">
                {stats.accuracyToday === null ? '—' : `${Math.round(stats.accuracyToday * 100)}%`}
              </div>
              <div className="tally__label">今日正确率</div>
            </div>
            <div className="tally__cell">
              <div className="tally__value">{stats.learningWords}</div>
              <div className="tally__label">学习中</div>
            </div>
          </div>
        ) : null}

        <div className="button-row">
          <Link className="button button--primary" to={`/words/study?mode=new${bookQuery}`}>
            开始学新词
          </Link>
          <Link className="button button--quiet" to={`/words/study?mode=review${bookQuery}`}>
            开始复习
          </Link>
        </div>
      </section>

      <section className="card">
        <p className="section-label">今日任务</p>
        <div className="tally">
          {TASKS.map((task) => (
            <Link
              key={task.mode}
              className="card"
              style={{ display: 'block', textDecoration: 'none' }}
              to={`/words/study?mode=${task.mode}${bookQuery}`}
            >
              <div className="tally__value" style={{ fontSize: 18 }}>
                {task.title}
              </div>
              <div className="tally__label">{task.hint}</div>
            </Link>
          ))}
        </div>
        <div className="button-row">
          <Link className="button button--quiet" to="/words">
            全部单词功能
          </Link>
          <Link className="button button--quiet" to="/stats">
            学习统计
          </Link>
        </div>
      </section>
    </>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
