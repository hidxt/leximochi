import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import { NotebookPage } from './NotebookPage';

describe('NotebookPage', () => {
  it('列出已收藏的词，并能移出', async () => {
    const remove = vi.fn().mockResolvedValue({ removed: true });
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            wordId: 'w-abandon',
            headword: 'abandon',
            definitionZh: '放弃；抛弃',
            note: null,
            source: 'manual',
            addedAt: Date.now(),
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    const api = {
      notebook: { list, remove, add: vi.fn() },
      vocabulary: { searchWords: vi.fn().mockResolvedValue([]) },
    } as unknown as ApiClient;

    render(
      <MemoryRouter>
        <NotebookPage api={api} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('abandon')).toBeInTheDocument());
    expect(screen.getByText(/放弃；抛弃/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '移出' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('w-abandon'));
    await waitFor(() => expect(screen.getByText(/还没有收藏任何词/)).toBeInTheDocument());
  });

  it('搜索后可以加入生词本', async () => {
    const add = vi.fn().mockResolvedValue({ created: true, entry: {} });
    const searchWords = vi.fn().mockResolvedValue([
      { id: 'w-brief', headword: 'brief', phoneticUk: null, phoneticUs: null, definitionZh: '简短的', examMeaning: null },
    ]);
    const api = {
      notebook: { list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), add, remove: vi.fn() },
      vocabulary: { searchWords },
    } as unknown as ApiClient;

    render(
      <MemoryRouter>
        <NotebookPage api={api} />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText('搜词加入'), 'brief');
    await userEvent.click(screen.getByRole('button', { name: '搜索' }));
    await waitFor(() => expect(screen.getByText('brief')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '加入生词本' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith({ wordId: 'w-brief' }));
  });
});
