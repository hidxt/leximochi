import type { ReactElement } from 'react';

interface FieldProps {
  id: string;
  label: string;
  type?: 'text' | 'password';
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
}

export function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  hint,
  autoComplete,
  required,
}: FieldProps): ReactElement {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        className="field__input"
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
