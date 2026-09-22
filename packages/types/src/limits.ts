export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_GROUP_COUNT = 3;
export const RECOVERY_CODE_GROUP_LENGTH = 4;
export const REFRESH_TOKEN_COOKIE_NAME = 'leximochi_rt';
export const MOBILE_CLIENT_HEADER = 'x-client-type';

// ---- Phase 2：词汇与上传 ----
/** 词库离线导出分页上限 */
export const WORDBOOK_EXPORT_PAGE_MAX = 200;
/** 通用列表分页上限 */
export const LIST_PAGE_MAX = 100;
/** 音频上传大小上限（5 MB） */
export const AUDIO_MAX_BYTES = 5 * 1024 * 1024;
/** 音频扩展名白名单 */
export const AUDIO_ALLOWED_EXTENSIONS = ['.mp3', '.m4a', '.ogg'] as const;
/** 音频允许的真实 MIME 白名单（按文件头识别） */
export const AUDIO_ALLOWED_MIME_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac'] as const;
/** 单次批量导入的最大词条数 */
export const WORD_IMPORT_MAX_ITEMS = 500;
/** 默认每日新词目标（Phase 2 使用服务端默认值；用户自定义目标在 Phase 3） */
export const DEFAULT_DAILY_NEW_TARGET = 20;
