import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from './RequireAuth';

function renderAt(authenticated: boolean): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth authenticated={authenticated}>
              <div>受保护内容</div>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<div>登录页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('未登录时重定向到登录页', () => {
    renderAt(false);
    expect(screen.getByText('登录页')).toBeInTheDocument();
    expect(screen.queryByText('受保护内容')).not.toBeInTheDocument();
  });

  it('已登录时渲染子内容', () => {
    renderAt(true);
    expect(screen.getByText('受保护内容')).toBeInTheDocument();
  });
});
