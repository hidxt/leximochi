import { useState, type ReactElement } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** 高风险操作必须填写原因，服务端也会校验 */
  requireReason?: boolean;
  confirmLabel?: string;
  onConfirm: (input: { reason: string }) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  requireReason = false,
  confirmLabel = '确认',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement | null {
  const [reason, setReason] = useState('');

  if (!open) return null;

  const blocked = requireReason && reason.trim().length < 2;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        <p className="dialog__description">{description}</p>

        {requireReason ? (
          <div className="field">
            <label className="field__label" htmlFor="confirm-reason">
              原因
            </label>
            <input
              id="confirm-reason"
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        ) : null}

        <div className="dialog__actions">
          <button className="button button--quiet" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={blocked}
            onClick={() => onConfirm({ reason: reason.trim() })}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
