import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import type { ApiClient } from '@leximochi/api-client';
import type { ReviewStats, SpellingErrorSummary } from '@leximochi/types';
import { Notice } from '../components/Notice';

interface StatsPageProps {
  api: ApiClient;
}

/** 学习统计：今日量、正确率、平均用时、状态分布、近 7 日趋势与错拼清单 */
export function StatsPage({ api }: StatsPageProps): ReactElement {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [spelling, setSpelling] = useState<SpellingErrorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [current, errors] = await Promise.all([api.review.stats(), api.review.spellingErrors(10)]);
      setStats(current);
      setSpelling(errors);
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <section className="card">
        <Notice tone="error">{error}</Notice>
        <button className="button button--quiet" type="button" onClick={() => void load()}>
          重试
        </button>
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="card">
        <p className="mono">正在统计…</p>
      </section>
    );
  }

  const peak = Math.max(1, ...stats.dailyTrend.map((point) => point.newWords + point.reviews));

  return (
    <>
      <section className="card">
        <span className="seal">统计</span>
        <h1 className="title">学习统计</h1>
        <p className="subtitle">全部数值由服务端聚合，切换设备后结果一致。</p>

        <div className="tally">
          <Cell value={stats.learnedToday} label="今日新学" />
          <Cell value={stats.reviewedToday} label="今日复习" />
          <Cell value={stats.correctToday} label="今日答对" />
          <Cell
            value={stats.accuracyToday === null ? '—' : `${Math.round(stats.accuracyToday * 100)}%`}
            label="今日正确率"
          />
          <Cell
            value={
              stats.averageDurationMsToday === null
                ? '—'
                : `${(stats.averageDurationMsToday / 1000).toFixed(1)}s`
            }
            label="平均用时"
          />
          <Cell value={stats.masteredWords} label="已掌握" />
          <Cell value={stats.learningWords} label="学习中" />
          <Cell value={stats.notebookCount} label="生词本" />
        </div>
      </section>

      <section className="card">
        <p className="section-label">近 7 日</p>
        <div className="trend" data-testid="trend">
          {stats.dailyTrend.map((point) => {
            const total = point.newWords + point.reviews;
            return (
              <div className="trend__day" key={point.date} title={`${point.date} 新学 ${point.newWords} · 复习 ${point.reviews}`}>
                <div className="trend__stack">
                  {point.reviews > 0 ? (
                    <div
                      className="trend__bar trend__bar--review"
                      style={{ height: `${(point.reviews / peak) * 100}%` }}
                    />
                  ) : null}
                  {point.newWords > 0 ? (
                    <div
                      className="trend__bar trend__bar--new"
                      style={{ height: `${(point.newWords / peak) * 100}%` }}
                    />
                  ) : null}
                  {total === 0 ? <div className="trend__bar" style={{ height: 2, background: 'var(--border)' }} /> : null}
                </div>
                <span className="trend__label">{point.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          <span className="legend__key">
            <span className="legend__swatch" style={{ background: 'var(--cinnabar)' }} />
            新学
          </span>
          <span className="legend__key">
            <span className="legend__swatch" style={{ background: 'var(--matcha)' }} />
            复习
          </span>
        </div>
      </section>

      <section className="card">
        <p className="section-label">错拼清单</p>
        {spelling === null ? (
          <p className="mono">正在读取…</p>
        ) : spelling.items.length === 0 ? (
          <p className="subtitle">还没有错拼记录。拼写与听写答错时会按漏字母、顺序错误等分类记录。</p>
        ) : (
          <div className="rows">
            {spelling.items.map((item) => (
              <div className="row" key={item.wordId}>
                <div>
                  <div className="row__word">{item.headword}</div>
                  <div className="row__meta">
                    错 {item.totalCount} 次 · 最近输入「{item.lastActual}」· {describeTypes(item.errorCounts)}
                  </div>
                </div>
                <span className="field__hint">{formatDate(item.lastAt)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="field__hint">共 {spelling?.total ?? 0} 个词有过错拼记录，这些词在复习中会更早出现。</p>
        <div className="button-row">
          <Link className="button button--quiet" to="/words/study?mode=spelling">
            去练拼写
          </Link>
        </div>
      </section>
    </>
  );
}

function Cell({ value, label }: { value: number | string; label: string }): ReactElement {
  return (
    <div className="tally__cell">
      <div className="tally__value">{value}</div>
      <div className="tally__label">{label}</div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  missing_letter: '漏字母',
  duplicate_letter: '多字母',
  order_error: '顺序',
  wrong_letter: '错字母',
};

function describeTypes(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`);
  return parts.length > 0 ? parts.join(' / ') : '暂无分类';
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败，请稍后重试';
}
