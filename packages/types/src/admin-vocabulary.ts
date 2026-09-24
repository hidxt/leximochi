/**
 * 管理后台的词库/词条契约（与普通用户接口分开，权限与字段更宽）。
 */

import type { WordbookSummary } from './vocabulary';

export interface AdminWordbookDetail extends WordbookSummary {
  createdAt: number;
  updatedAt: number;
}

export interface AdminWordListItem {
  id: string;
  headword: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  source: string;
  /** 首条中文释义，便于列表快速核对 */
  definitionZh: string | null;
  senseCount: number;
  hasAudio: boolean;
  updatedAt: number;
}

export interface AdminWordPage {
  items: AdminWordListItem[];
  nextCursor: string | null;
}

export interface AdminAudioUploadResponse {
  wordId: string;
  kind: 'uk' | 'us';
  /** 存储 key：业务代码不拼接绝对路径，客户端凭 key 走鉴权接口取音频 */
  audioKey: string;
}
