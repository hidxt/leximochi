import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('要求填写原因后才允许确认', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="确认封禁"
        description="封禁后该用户将无法登录"
        requireReason
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: '确认' });
    expect(confirm).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('原因'), '违规内容');
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reason: '违规内容' });
  });

  it('不要求原因时可直接确认', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="确认解封" description="解封后需重新登录" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledWith({ reason: '' });
  });

  it('关闭状态不渲染对话框', () => {
    render(
      <ConfirmDialog open={false} title="t" description="d" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
