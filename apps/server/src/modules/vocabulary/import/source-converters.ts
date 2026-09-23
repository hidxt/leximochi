import type { ImportExampleInput, ImportRelationInput, ImportWordInput } from './import.types';

/**
 * 数据源转换：把 KyleBing/english-vocabulary 的 `full_line_jsonl/full/正序/*.jsonl`
 * 行结构转换为本项目的规范导入格式。
 *
 * 数据来源与授权状态见 `docs/asset-licenses.md`（**导入前必须已登记授权**）。
 *
 * 映射说明（刻意跳过无法诚实映射的字段）：
 * - `ukphone` / `usphone` → `phoneticUk` / `phoneticUs`（原值不含斜杠，统一补成 `/…/` 便于展示）
 * - `trans[]` → 词义（pos → 词性，tranCn → 中文释义）
 *   注意：`descCn` 在来源里是「中释/英释」这类**标签**，不是英文释义，因此不映射为 `definitionEn`
 * - `sentence.sentences[]` → 例句（sContent → 英文，sCn → 中文）
 * - `phrase.phrases[]` → 短语（pContent / pCn）
 * - `syno.synos[].hwds[]` → 同义词；`antos.anto[]` → 反义词；`relWord.rels[].words[]` → 同根词
 * - 跳过：`ukspeech`/`usspeech`（是第三方发音服务的查询标识，**不是音频文件**，
 *   不能当作本项目的音频 key，否则会造成「有音频可播」的假象）
 * - 跳过：`realExamSentence` / `exam`（真题句子，本阶段无对应字段，避免污染例句）
 * - 跳过：`remMethod`（来源提供的记忆法，不属于 AI 生成内容，写入 `word_ai_notes` 会造成来源误标）
 * - 词形变化：来源把变化形式混写在释义文本中，无独立字段，故不导入
 */

interface RawSentence {
  sContent?: string;
  sCn?: string;
}

interface RawContent {
  ukphone?: string;
  usphone?: string;
  trans?: Array<{ tranCn?: string; descCn?: string; pos?: string }>;
  sentence?: { sentences?: RawSentence[] };
  phrase?: { phrases?: Array<{ pContent?: string; pCn?: string }> };
  syno?: { synos?: Array<{ hwds?: Array<{ w?: string }> }> };
  antos?: { anto?: Array<{ hwd?: string }> };
  relWord?: { rels?: Array<{ words?: Array<{ hwd?: string }> }> };
}

interface RawEntry {
  headWord?: string;
  wordRank?: number;
  content?: { word?: { content?: RawContent } };
}

/** 把不带斜杠的音标统一成 `/…/`（已是斜杠包裹的原样保留） */
export function normalizePhonetic(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed;
  return `/${trimmed}/`;
}

/**
 * 转换单行；无法转换（缺词形或缺释义）返回 null，由调用方统计跳过数量。
 */
export function convertKyleBingEntry(raw: unknown): ImportWordInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as RawEntry;
  const headword = (entry.headWord ?? '').trim();
  if (headword.length === 0) return null;
  const content = entry.content?.word?.content ?? {};

  const senses = (content.trans ?? [])
    .map((item) => ({
      partOfSpeech: (item.pos ?? '').trim() || null,
      definitionZh: (item.tranCn ?? '').trim(),
      // descCn 是来源的标签字段（如「中释」），不是英文释义，故不映射
      definitionEn: null,
      examMeaning: null,
    }))
    .filter((sense) => sense.definitionZh.length > 0);
  if (senses.length === 0) return null;

  const examples: ImportExampleInput[] = (content.sentence?.sentences ?? [])
    .map((sentence) => ({
      textEn: (sentence.sContent ?? '').trim(),
      textZh: (sentence.sCn ?? '').trim(),
    }))
    .filter((example) => example.textEn.length > 0 && example.textZh.length > 0);

  const phrases = (content.phrase?.phrases ?? [])
    .map((phrase) => ({
      kind: 'phrase' as const,
      text: (phrase.pContent ?? '').trim(),
      translation: (phrase.pCn ?? '').trim(),
    }))
    .filter((phrase) => phrase.text.length > 0 && phrase.translation.length > 0);

  const relations: ImportRelationInput[] = [];
  for (const syno of content.syno?.synos ?? []) {
    for (const item of syno.hwds ?? []) {
      const text = (item.w ?? '').trim();
      if (text.length > 0) relations.push({ relationType: 'synonym', targetText: text });
    }
  }
  for (const item of content.antos?.anto ?? []) {
    const text = (item.hwd ?? '').trim();
    if (text.length > 0) relations.push({ relationType: 'antonym', targetText: text });
  }
  for (const rel of content.relWord?.rels ?? []) {
    for (const item of rel.words ?? []) {
      const text = (item.hwd ?? '').trim();
      if (text.length > 0) relations.push({ relationType: 'derived', targetText: text });
    }
  }

  return {
    headword,
    phoneticUk: normalizePhonetic(content.ukphone),
    phoneticUs: normalizePhonetic(content.usphone),
    // 来源没有音频文件：不写入任何音频 key
    audioUkKey: null,
    audioUsKey: null,
    rank: typeof entry.wordRank === 'number' ? entry.wordRank : null,
    tags: [],
    senses,
    examples,
    phrases,
    forms: [],
    relations,
    aiNotes: null,
  };
}

/** 解析整个 JSONL 文本；返回转换结果与跳过统计 */
export function convertKyleBingJsonl(text: string): {
  words: ImportWordInput[];
  skipped: number;
} {
  const words: ImportWordInput[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const converted = convertKyleBingEntry(JSON.parse(trimmed) as unknown);
      if (converted) words.push(converted);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { words, skipped };
}
