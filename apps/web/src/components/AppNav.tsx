import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * 一级导航：首页 / 单词 / 口语 / 听力 / 我的（产品基线固定五项）。
 * 口语与听力属于后续阶段，这里显式标注「未开放」，不建空页面假装已完成。
 */
const ITEMS: Array<{ to: string; label: string; planned?: boolean }> = [
  { to: '/', label: '首页' },
  { to: '/words', label: '单词' },
  { to: '/speaking', label: '口语', planned: true },
  { to: '/listening', label: '听力', planned: true },
  { to: '/me', label: '我的' },
];

export function AppNav(): ReactElement {
  return (
    <nav className="nav" aria-label="主导航">
      {ITEMS.map((item) =>
        item.planned ? (
          <span key={item.to} className="nav__item nav__item--planned" title="该模块将在后续阶段开放">
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav__item${isActive ? ' nav__item--active' : ''}`}
          >
            {item.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}
