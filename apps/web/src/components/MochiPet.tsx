import type { ReactElement, ReactNode } from 'react';

interface MochiPetProps {
  /** awake：已登录（清醒、冒热气）；sleepy：未登录（眯眼、无热气） */
  mood: 'awake' | 'sleepy';
  caption: ReactNode;
}

/**
 * 团子：本项目唯一的「活泼」来源，纯 CSS 绘制，不依赖任何外部素材（避免素材许可证问题）。
 * 表情与蒸汽只表达会话状态，不做无意义的装饰动画。
 */
export function MochiPet({ mood, caption }: MochiPetProps): ReactElement {
  return (
    <div className="desk__pet">
      <div className={`mochi${mood === 'sleepy' ? ' mochi--sleepy' : ''}`} aria-hidden="true">
        <span className="mochi__steam mochi__steam--a" />
        <span className="mochi__steam mochi__steam--b" />
        <div className="mochi__body">
          <span className="mochi__eye mochi__eye--left" />
          <span className="mochi__eye mochi__eye--right" />
          <span className="mochi__cheek mochi__cheek--left" />
          <span className="mochi__cheek mochi__cheek--right" />
        </div>
      </div>
      <p className="pet-caption">{caption}</p>
    </div>
  );
}
