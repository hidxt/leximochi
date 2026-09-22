import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@leximochi/api-client';
import type { ApiClient } from '@leximochi/api-client';
import { UsersPage } from './UsersPage';

const alice = {
  id: 'u1',
  username: 'alice',
  status: 'active' as const,
  roles: ['user'],
  createdAt: 1,
  lastLoginAt: null,
};

function fakeApi(overrides: Partial<ApiClient['admin']> = {}): ApiClient {
  return {
    admin: {
      listUsers: vi.fn().mockResolvedValue({ items: [alice], nextCursor: null }),
      banUser: vi.fn().mockResolvedValue({ ok: true }),
      unbanUser: vi.fn().mockResolvedValue({ ok: true }),
      ...overrides,
    },
  } as unknown as ApiClient;
}

describe('UsersPage', () => {
  it('封禁需要二次确认，确认后调用封禁接口并刷新列表', async () => {
    const api = fakeApi();
    render(<UsersPage api={api} />);

    await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());
    expect(api.admin.banUser).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '封禁' }));
    await userEvent.type(screen.getByLabelText('原因'), '违规内容');
    await userEvent.click(screen.getByRole('button', { name: '确认封禁' }));

    await waitFor(() =>
      expect(api.admin.banUser).toHaveBeenCalledWith('u1', { reason: '违规内容' }),
    );
    expect(api.admin.listUsers).toHaveBeenCalledTimes(2);
  });

  it('权限不足时展示明确错误而不崩溃', async () => {
    const api = fakeApi({
      listUsers: vi
        .fn()
        .mockRejectedValue(
          new ApiError({ code: 'FORBIDDEN', message: '没有权限执行该操作', status: 403, requestId: 'r1' }),
        ),
    });
    render(<UsersPage api={api} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('没有权限执行该操作'));
  });

  it('已封禁用户显示解封入口', async () => {
    const api = fakeApi({
      listUsers: vi
        .fn()
        .mockResolvedValue({ items: [{ ...alice, status: 'banned' }], nextCursor: null }),
    });
    render(<UsersPage api={api} />);

    await waitFor(() => expect(screen.getByRole('button', { name: '解封' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '解封' }));
    await userEvent.click(screen.getByRole('button', { name: '确认解封' }));
    await waitFor(() => expect(api.admin.unbanUser).toHaveBeenCalledWith('u1'));
  });
});
