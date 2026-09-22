/**
 * 设计 Token：全平台唯一来源（Web / Admin / Android 共享，不共享组件）。
 * 视觉取向：宣纸与墨的底子 + 朱砂只用于「一个动作」 + 团子（宠物）作为唯一的活泼来源。
 * 平台各自实现 UI，但颜色、间距、圆角、字号层级都从这里取。
 */
export const tokens = {
  color: {
    /** 宣纸白：页面底色 */
    paper: '#FAF6EE',
    /** 卡片面：略亮于底色，形成纸张叠放感 */
    surface: '#FFFCF6',
    /** 墨：正文 */
    ink: '#191510',
    /** 淡墨：次级文字 */
    inkSoft: '#6A6055',
    /** 朱砂：仅用于主动作与「印章」式状态标记，不做大面积铺色 */
    cinnabar: '#C8382B',
    /** 抹茶：正向状态（连续学习、成功） */
    matcha: '#3E7C59',
    /** 藤黄：奖励类信息，克制使用 */
    gold: '#D9A227',
    border: '#E4DACA',
    /** 错误态沿用朱砂的深色变体，避免引入第二个红色 */
    danger: '#A62D22',
  },
  font: {
    /** 刻本/教材气质的标题字：中文优先宋体系，回退衬线 */
    display: '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
    /** 界面正文：无衬线，保证小字号可读 */
    body: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    /** 恢复码/设备信息等需要逐字符比对的场景必须等宽 */
    mono: '"JetBrains Mono", "SFMono-Regular", Consolas, "Courier New", monospace',
  },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  radius: { sm: 6, md: 8, lg: 12, blob: 48 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 22, xl: 32 },
  duration: { fast: 120, normal: 240, slow: 480 },
} as const;

export type DesignTokens = typeof tokens;
