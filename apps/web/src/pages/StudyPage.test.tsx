import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import type { StudyNextResponse, SubmitReviewResponse } from '@leximochi/types';
import { StudyPage } from './StudyPage';

function nextPayload(overrides: Partial<StudyNextResponse> = {}): StudyNextResponse {
  return {
    question: {
      questionId: 'q1',
      wordId: 'w-abandon',
      questionType: 'spelling',
      mode: 'spelling',
      prompt: '放弃；抛弃',
      phonetic: '/əˈbændən/',
      audioKey: null,
      options: [],
      requiresInput: true,
    },
    progress: {
      newRemaining: 10,
      dueRemaining: 2,
      learnedToday: 1,
      reviewedToday: 0,
      dailyNewTarget: 20,
    },
    notice: null,
    ...overrides,
  };
}

function submitted(overrides: Partial<SubmitReviewResponse> = {}): SubmitReviewResponse {
  return {
    correct: false,
    correctAnswer: 'abandon',
    rating: 'again',
    state: {
      status: 'learning',
      easeFactor: 2.2,
      intervalDays: 0,
      repetitions: 0,
      lapses: 1,
      dueAt: Date.now() + 600_000,
      lastReviewedAt: Date.now(),
      totalReviews: 1,
      correctReviews: 0,
    },
    spellingErrors: ['missing_letter'],
    ...overrides,
  };
}

function fakeApi(overrides: {
  next?: ReturnType<typeof vi.fn>;
  submit?: ReturnType<typeof vi.fn>;
  addNotebook?: ReturnType<typeof vi.fn>;
} = {}): ApiClient {
  return {
    review: {
      next: overrides.next ?? vi.fn().mockResolvedValue(nextPayload()),
      submit: overrides.submit ?? vi.fn().mockResolvedValue(submitted()),
      spellingErrors: vi.fn(),
      history: vi.fn(),
      stats: vi.fn(),
    },
    notebook: {
      add: overrides.addNotebook ?? vi.fn().mockResolvedValue({ created: true, entry: {} }),
      list: vi.fn(),
      remove: vi.fn(),
    },
  } as unknown as ApiClient;
}

function renderStudy(api: ApiClient, search = '?mode=spelling') {
  return render(
    <MemoryRouter initialEntries={[`/words/study${search}`]}>
      <StudyPage api={api} />
    </MemoryRouter>,
  );
}

describe('StudyPage', () => {
  it('展示题面与进度，答错后落「错」印章并给出正确答案与错拼类型', async () => {
    const api = fakeApi();
    renderStudy(api);

    await waitFor(() => expect(screen.getByTestId('tian-text')).toHaveTextContent('放弃；抛弃'));
    expect(screen.getByText(/今日新词 1\/20/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('你的答案'), 'abandn');
    await userEvent.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() => expect(screen.getByTestId('stamp')).toHaveTextContent('错'));
    expect(screen.getByText(/正确答案：abandon/)).toBeInTheDocument();
    expect(screen.getByText(/漏字母/)).toBeInTheDocument();

    // 客户端只上报答题事实：答案与用时由服务端判定
    expect(api.review.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        wordId: 'w-abandon',
        questionType: 'spelling',
        answer: 'abandn',
        durationMs: expect.any(Number),
        eventId: expect.any(String),
      }),
    );
    const payload = (api.review.submit as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('rating');
    expect(payload).not.toHaveProperty('easeFactor');
  });

  it('答错后可把该词加入生词本', async () => {
    const api = fakeApi();
    renderStudy(api);
    await waitFor(() => expect(screen.getByLabelText('你的答案')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('你的答案'), 'abandn');
    await userEvent.click(screen.getByRole('button', { name: '提交答案' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '加入生词本' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '加入生词本' }));
    await waitFor(() => expect(screen.getByText('已加入生词本')).toBeInTheDocument());
    expect(api.notebook.add).toHaveBeenCalledWith({ wordId: 'w-abandon', source: 'from_review' });
  });

  it('答对后落「对」印章并允许进入下一题', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce(nextPayload())
      .mockResolvedValueOnce(
        nextPayload({
          question: {
            questionId: 'q2',
            wordId: 'w-brief',
            questionType: 'spelling',
            mode: 'spelling',
            prompt: '简短的',
            phonetic: null,
            audioKey: null,
            options: [],
            requiresInput: true,
          },
        }),
      );
    const api = fakeApi({
      next,
      submit: vi.fn().mockResolvedValue(submitted({ correct: true, rating: 'good', spellingErrors: [] })),
    });
    renderStudy(api);

    await waitFor(() => expect(screen.getByTestId('tian-text')).toHaveTextContent('放弃；抛弃'));
    await userEvent.type(screen.getByLabelText('你的答案'), 'abandon');
    await userEvent.click(screen.getByRole('button', { name: '提交答案' }));
    await waitFor(() => expect(screen.getByTestId('stamp')).toHaveTextContent('对'));

    await userEvent.click(screen.getByRole('button', { name: '下一题' }));
    await waitFor(() => expect(screen.getByTestId('tian-text')).toHaveTextContent('简短的'));
  });

  it('无可练习内容时展示服务端 notice，而不是空白页', async () => {
    const api = fakeApi({
      next: vi.fn().mockResolvedValue(
        nextPayload({
          question: null,
          notice: '当前词库还没有音频资源，听写暂不可用；可以先做拼写训练。',
        }),
      ),
    });
    renderStudy(api, '?mode=dictation');

    await waitFor(() =>
      expect(screen.getByText(/听写暂不可用/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: '回到单词' })).toBeInTheDocument();
  });

  it('选择题：选项由服务端下发，提交的是选项文本', async () => {
    const api = fakeApi({
      next: vi.fn().mockResolvedValue(
        nextPayload({
          question: {
            questionId: 'q3',
            wordId: 'w-abandon',
            questionType: 'definition_choice',
            mode: 'new',
            prompt: 'abandon',
            phonetic: null,
            audioKey: null,
            options: ['放纵', '放弃；抛弃', '吸收'],
            requiresInput: false,
          },
        }),
      ),
    });
    renderStudy(api, '?mode=new');

    await waitFor(() => expect(screen.getByRole('button', { name: '放弃；抛弃' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '放弃；抛弃' }));
    await userEvent.click(screen.getByRole('button', { name: '提交答案' }));

    await waitFor(() =>
      expect(api.review.submit).toHaveBeenCalledWith(
        expect.objectContaining({ answer: '放弃；抛弃', questionType: 'definition_choice' }),
      ),
    );
  });
});
