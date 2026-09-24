import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import { AdminWordsPage } from './AdminWordsPage';

const BOOK = {
  id: 'wb1',
  key: 'cet4',
  name: '四级核心词',
  description: null,
  language: 'en',
  version: 1,
  wordCount: 2,
  isSystem: true,
  createdAt: 1,
  updatedAt: 2,
};

const WORD = {
  id: 'w-abandon',
  headword: 'abandon',
  phoneticUk: '/əˈbændən/',
  phoneticUs: null,
  source: 'imported',
  definitionZh: '放弃；抛弃',
  senseCount: 2,
  hasAudio: false,
  updatedAt: 3,
};

function fakeApi(overrides: Record<string, ReturnType<typeof vi.fn>> = {}): ApiClient {
  return {
    admin: {
      vocabulary: {
        listWordbooks: overrides.listWordbooks ?? vi.fn().mockResolvedValue([BOOK]),
        listWords: overrides.listWords ?? vi.fn().mockResolvedValue({ items: [WORD], nextCursor: null }),
        getWord: overrides.getWord ?? vi.fn(),
        createWord: overrides.createWord ?? vi.fn().mockResolvedValue({ wordId: 'w-new', created: true }),
        updateWord: overrides.updateWord ?? vi.fn().mockResolvedValue({ wordId: 'w-abandon', created: false }),
        deleteWord: overrides.deleteWord ?? vi.fn().mockResolvedValue({ deleted: true }),
        importWords: overrides.importWords ?? vi.fn(),
        uploadWordAudio:
          overrides.uploadWordAudio ?? vi.fn().mockResolvedValue({ wordId: 'w-abandon', kind: 'uk', audioKey: 'k' }),
      },
    },
  } as unknown as ApiClient;
}

describe('AdminWordsPage', () => {
  it('检索结果展示释义、释义条数与音频状态', async () => {
    const listWords = vi.fn().mockResolvedValue({ items: [WORD], nextCursor: null });
    const api = fakeApi({ listWords });
    render(<AdminWordsPage api={api} />);

    await waitFor(() => expect(screen.getByText('abandon')).toBeInTheDocument());
    expect(screen.getByText('放弃；抛弃')).toBeInTheDocument();
    expect(screen.getByText('2 条释义')).toBeInTheDocument();
    expect(screen.getByText('无')).toBeInTheDocument();
  });

  it('批量导入展示逐条失败原因', async () => {
    const importWords = vi.fn().mockResolvedValue({
      wordbookKey: 'cet6',
      created: 1,
      updated: 0,
      failed: [
        { index: 1, headword: null, reason: '缺少词形' },
        { index: 2, headword: 'elaborate', reason: '存在空的例句' },
      ],
      version: 2,
      wordCount: 1,
    });
    const api = fakeApi({ importWords });
    render(<AdminWordsPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '批量导入' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '批量导入' }));

    await userEvent.type(screen.getByLabelText('词库 key'), 'cet6');
    await userEvent.type(screen.getByLabelText('词库名称'), '六级核心词');
    // JSON 里的花括号会被 userEvent 当成按键描述符，这里直接触发 change
    fireEvent.change(screen.getByLabelText('JSON 数组'), {
      target: { value: '[{"headword":"diligent","senses":[{"definitionZh":"勤勉的"}]}]' },
    });
    await userEvent.click(screen.getByRole('button', { name: '开始导入' }));

    await waitFor(() => expect(screen.getByText(/新增 1 条/)).toBeInTheDocument());
    expect(screen.getByText('缺少词形')).toBeInTheDocument();
    expect(screen.getByText('存在空的例句')).toBeInTheDocument();
    expect(importWords).toHaveBeenCalledWith({
      wordbookKey: 'cet6',
      wordbookName: '六级核心词',
      items: [{ headword: 'diligent', senses: [{ definitionZh: '勤勉的' }] }],
    });
  });

  it('非 JSON 数组的导入内容被前端拦下，不发请求', async () => {
    const importWords = vi.fn();
    const api = fakeApi({ importWords });
    render(<AdminWordsPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '批量导入' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '批量导入' }));
    await userEvent.type(screen.getByLabelText('词库 key'), 'cet6');
    await userEvent.type(screen.getByLabelText('词库名称'), '六级核心词');
    fireEvent.change(screen.getByLabelText('JSON 数组'), { target: { value: '{"a":1}' } });
    await userEvent.click(screen.getByRole('button', { name: '开始导入' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('导入内容必须是 JSON 数组'));
    expect(importWords).not.toHaveBeenCalled();
  });

  it('上传音频会以 multipart 形式提交文件与类型', async () => {
    const uploadWordAudio = vi
      .fn()
      .mockResolvedValue({ wordId: 'w-abandon', kind: 'us', audioKey: 'word-audio/x.mp3' });
    const api = fakeApi({ uploadWordAudio });
    render(<AdminWordsPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '传音频' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '传音频' }));

    const dialog = await screen.findByRole('dialog', { name: /上传音频/ });
    expect(dialog).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('发音类型'), 'us');
    const file = new File([new Uint8Array([0x49, 0x44, 0x33])], 'abandon.mp3', { type: 'audio/mpeg' });
    await userEvent.upload(screen.getByLabelText('音频文件'), file);

    await waitFor(() => expect(uploadWordAudio).toHaveBeenCalledWith('w-abandon', 'us', file));
  });

  it('删除词条需要二次确认', async () => {
    const deleteWord = vi.fn().mockResolvedValue({ deleted: true });
    const api = fakeApi({ deleteWord });
    render(<AdminWordsPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(deleteWord).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('button', { name: '确认删除词条' }));
    await waitFor(() => expect(deleteWord).toHaveBeenCalledWith('w-abandon'));
  });
});
