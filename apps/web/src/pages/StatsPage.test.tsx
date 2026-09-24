import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import { StatsPage } from './StatsPage';

describe('StatsPage', () => {
  it('展示今日统计、7 日趋势与错拼清单', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const api = {
      review: {
        stats: vi.fn().mockResolvedValue({
          learnedToday: 3,
          reviewedToday: 5,
          correctToday: 6,
          accuracyToday: 0.75,
          averageDurationMsToday: 4200,
          masteredWords: 2,
          learningWords: 9,
          notebookCount: 1,
          dailyTrend: [
            { date: yesterday, newWords: 1, reviews: 1 },
            { date: today, newWords: 3, reviews: 5 },
          ],
        }),
        spellingErrors: vi.fn().mockResolvedValue({
          total: 1,
          items: [
            {
              wordId: 'w-abruptly',
              headword: 'abruptly',
              lastActual: 'aburptly',
              errorCounts: { missing_letter: 0, duplicate_letter: 0, order_error: 2, wrong_letter: 0 },
              totalCount: 2,
              firstAt: Date.now() - 1000,
              lastAt: Date.now(),
            },
          ],
        }),
      },
    } as unknown as ApiClient;

    render(
      <MemoryRouter>
        <StatsPage api={api} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('75%')).toBeInTheDocument());
    expect(screen.getByText('4.2s')).toBeInTheDocument();
    expect(screen.getByText('已掌握')).toBeInTheDocument();
    expect(screen.getByTestId('trend').children).toHaveLength(2);

    await waitFor(() => expect(screen.getByText('abruptly')).toBeInTheDocument());
    expect(screen.getByText(/错 2 次/)).toBeInTheDocument();
    expect(screen.getByText(/最近输入「aburptly」/)).toBeInTheDocument();
    expect(screen.getByText(/顺序 2/)).toBeInTheDocument();
  });

  it('无作答记录时正确率与平均用时显示为「—」而不是 0', async () => {
    const api = {
      review: {
        stats: vi.fn().mockResolvedValue({
          learnedToday: 0,
          reviewedToday: 0,
          correctToday: 0,
          accuracyToday: null,
          averageDurationMsToday: null,
          masteredWords: 0,
          learningWords: 0,
          notebookCount: 0,
          dailyTrend: [{ date: new Date().toISOString().slice(0, 10), newWords: 0, reviews: 0 }],
        }),
        spellingErrors: vi.fn().mockResolvedValue({ total: 0, items: [] }),
      },
    } as unknown as ApiClient;

    render(
      <MemoryRouter>
        <StatsPage api={api} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/还没有错拼记录/)).toBeInTheDocument());
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});
