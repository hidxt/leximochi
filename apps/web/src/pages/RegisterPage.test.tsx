import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@leximochi/api-client';
import { RegisterPage } from './RegisterPage';

function fakeApi(overrides: Partial<ApiClient['auth']> = {}): ApiClient {
  return {
    auth: {
      issueCaptcha: vi.fn().mockResolvedValue({
        token: 'captcha-token-value',
        question: '1 + 2 = ?',
        expiresAt: Date.now() + 60_000,
      }),
      register: vi.fn().mockResolvedValue({
        user: { id: 'u1', username: 'alice', status: 'active', roles: ['user'], createdAt: 1 },
        recoveryCodes: ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
      }),
      ...overrides,
    },
  } as unknown as ApiClient;
}

describe('RegisterPage', () => {
  it('提交后展示恢复码并要求用户确认已保存', async () => {
    const api = fakeApi();
    const onRegistered = vi.fn();
    render(
      <MemoryRouter>
        <RegisterPage api={api} onRegistered={onRegistered} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText(/人机验证/)).toBeInTheDocument());
    expect(screen.getByText(/1 \+ 2 = \?/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'Str0ng-Passphrase');
    await userEvent.type(screen.getByLabelText(/人机验证/), '3');
    await userEvent.click(screen.getByRole('button', { name: '创建账号' }));

    await waitFor(() => expect(screen.getByText('AAAA-BBBB-CCCC')).toBeInTheDocument());
    expect(screen.getByText(/请立即保存/)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: '我已保存，去登录' });
    expect(confirmButton).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/我已把恢复码保存到安全的地方/));
    await userEvent.click(confirmButton);
    expect(onRegistered).toHaveBeenCalledTimes(1);
  });

  it('服务端拒绝时展示错误信息且不显示恢复码', async () => {
    const api = fakeApi({
      register: vi.fn().mockRejectedValue(new Error('该用户名已被使用')),
    });
    render(
      <MemoryRouter>
        <RegisterPage api={api} onRegistered={vi.fn()} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText(/人机验证/)).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'Str0ng-Passphrase');
    await userEvent.type(screen.getByLabelText(/人机验证/), '3');
    await userEvent.click(screen.getByRole('button', { name: '创建账号' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('该用户名已被使用'));
    expect(screen.queryByText('AAAA-BBBB-CCCC')).not.toBeInTheDocument();
  });
});
