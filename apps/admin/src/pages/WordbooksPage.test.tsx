import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import { WordbooksPage } from './WordbooksPage';

function fakeApi(overrides: Record<string, ReturnType<typeof vi.fn>> = {}): ApiClient {
  return {
    admin: {
      vocabulary: {
        listWordbooks: overrides.listWordbooks ?? vi.fn().mockResolvedValue([]),
        getWordbook: vi.fn(),
        createWordbook: overrides.createWordbook ?? vi.fn().mockResolvedValue({}),
        updateWordbook: overrides.updateWordbook ?? vi.fn().mockResolvedValue({}),
        deleteWordbook: overrides.deleteWordbook ?? vi.fn().mockResolvedValue({ deleted: true }),
      },
    },
  } as unknown as ApiClient;
}

const BOOK = {
  id: 'wb1',
  key: 'cet4',
  name: '四级核心词',
  description: null,
  language: 'en',
  version: 3,
  wordCount: 4544,
  isSystem: true,
  createdAt: 1,
  updatedAt: 2,
};

describe('WordbooksPage', () => {
  it('展示词库列表（词数与版本）', async () => {
    const api = fakeApi({ listWordbooks: vi.fn().mockResolvedValue([BOOK]) });
    render(<WordbooksPage api={api} />);

    await waitFor(() => expect(screen.getByText('cet4')).toBeInTheDocument());
    expect(screen.getByText('四级核心词')).toBeInTheDocument();
    expect(screen.getByText('4544')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('系统')).toBeInTheDocument();
  });

  it('新建词库会把 key/名称/是否系统提交给接口', async () => {
    const createWordbook = vi.fn().mockResolvedValue(BOOK);
    const api = fakeApi({ createWordbook, listWordbooks: vi.fn().mockResolvedValue([]) });
    render(<WordbooksPage api={api} />);

    await userEvent.type(screen.getByLabelText(/key/), 'postgrad-2026');
    await userEvent.type(screen.getByLabelText('名称'), '考研核心词');
    await userEvent.click(screen.getByRole('button', { name: '新建词库' }));

    await waitFor(() =>
      expect(createWordbook).toHaveBeenCalledWith({
        key: 'postgrad-2026',
        name: '考研核心词',
        description: undefined,
        isSystem: false,
      }),
    );
  });

  it('删除词库必须经过二次确认后才调用接口', async () => {
    const deleteWordbook = vi.fn().mockResolvedValue({ deleted: true });
    const api = fakeApi({
      listWordbooks: vi.fn().mockResolvedValue([BOOK]),
      deleteWordbook,
    });
    render(<WordbooksPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    // 先出现确认弹窗，此时还没有调用删除
    const dialog = await screen.findByRole('dialog', { name: /删除词库/ });
    expect(dialog).toBeInTheDocument();
    expect(deleteWordbook).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '确认删除词库' }));
    await waitFor(() => expect(deleteWordbook).toHaveBeenCalledWith('wb1'));
  });
});
