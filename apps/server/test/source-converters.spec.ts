import { convertKyleBingEntry, convertKyleBingJsonl, normalizePhonetic } from '../src/modules/vocabulary/import/source-converters';

function rawEntry(overrides: Record<string, unknown> = {}): unknown {
  return {
    wordRank: 7,
    headWord: 'abruptly',
    bookId: 'CET4_1',
    content: {
      word: {
        wordHead: 'abruptly',
        content: {
          ukphone: "ə'brʌptlɪ",
          usphone: "ə'brʌptli",
          ukspeech: 'abruptly&type=1',
          usspeech: 'abruptly&type=2',
          trans: [{ pos: 'adv', tranCn: '突然地；唐突地', descCn: '中释' }],
          sentence: {
            desc: '例句',
            sentences: [
              { sContent: 'The path ends off abruptly.', sCn: '这条路突然到头了。' },
              { sContent: '', sCn: '' },
            ],
          },
          phrase: { phrases: [{ pContent: 'abruptly change', pCn: '骤变' }] },
          syno: { synos: [{ pos: 'adv', hwds: [{ w: 'suddenly' }, { w: 'shortly' }] }] },
          antos: { anto: [{ hwd: 'gradually' }] },
          relWord: { rels: [{ pos: 'adj', words: [{ hwd: 'abrupt', tran: '突然的' }] }] },
          realExamSentence: { sentences: [{ sContent: 'exam sentence' }] },
          remMethod: { val: '记忆法内容' },
          ...overrides,
        },
      },
    },
  };
}

describe('convertKyleBingEntry', () => {
  it('映射音标并统一补斜杠', () => {
    const word = convertKyleBingEntry(rawEntry());
    expect(word?.phoneticUk).toBe("/ə'brʌptlɪ/");
    expect(word?.phoneticUs).toBe("/ə'brʌptli/");
  });

  it('映射释义（词性/中文）并忽略来源的 descCn 标签字段', () => {
    const word = convertKyleBingEntry(rawEntry());
    // 来源的 descCn 是「中释」这类标签，不能当作英文释义
    expect(word?.senses).toEqual([
      { partOfSpeech: 'adv', definitionZh: '突然地；唐突地', definitionEn: null, examMeaning: null },
    ]);
  });

  it('映射例句并丢弃中英文不完整的行', () => {
    const word = convertKyleBingEntry(rawEntry());
    expect(word?.examples).toEqual([
      { textEn: 'The path ends off abruptly.', textZh: '这条路突然到头了。' },
    ]);
  });

  it('映射短语、同义、反义与同根词', () => {
    const word = convertKyleBingEntry(rawEntry());
    expect(word?.phrases).toEqual([{ kind: 'phrase', text: 'abruptly change', translation: '骤变' }]);
    expect(word?.relations).toEqual([
      { relationType: 'synonym', targetText: 'suddenly' },
      { relationType: 'synonym', targetText: 'shortly' },
      { relationType: 'antonym', targetText: 'gradually' },
      { relationType: 'derived', targetText: 'abrupt' },
    ]);
  });

  it('不写入音频 key（来源无音频文件）与真题/记忆法（避免来源误标）', () => {
    const word = convertKyleBingEntry(rawEntry());
    expect(word?.audioUkKey).toBeNull();
    expect(word?.audioUsKey).toBeNull();
    expect(word?.aiNotes).toBeNull();
    expect(JSON.stringify(word)).not.toContain('exam sentence');
    expect(JSON.stringify(word)).not.toContain('记忆法内容');
  });

  it('缺词形或缺释义时返回 null', () => {
    expect(convertKyleBingEntry({ headWord: '  ', content: { word: { content: {} } } })).toBeNull();
    expect(
      convertKyleBingEntry({
        headWord: 'ghost',
        content: { word: { content: { trans: [{ pos: 'n', tranCn: '   ' }] } } },
      }),
    ).toBeNull();
  });

  it('对畸形输入不抛异常', () => {
    expect(convertKyleBingEntry(null)).toBeNull();
    expect(convertKyleBingEntry('not-an-object')).toBeNull();
    expect(convertKyleBingEntry({ headWord: 'x', content: null })).toBeNull();
  });
});

describe('convertKyleBingJsonl', () => {
  it('逐行转换并统计跳过行', () => {
    const text = [
      JSON.stringify(rawEntry()),
      '',
      'not-json',
      JSON.stringify({ headWord: '', content: {} }),
      JSON.stringify(rawEntry({ trans: [{ tranCn: '第二条释义' }] })),
    ].join('\n');
    const { words, skipped } = convertKyleBingJsonl(text);
    expect(words).toHaveLength(2);
    expect(skipped).toBe(2);
  });
});

describe('normalizePhonetic', () => {
  it('处理空值与已包裹斜杠的情况', () => {
    expect(normalizePhonetic(undefined)).toBeNull();
    expect(normalizePhonetic('  ')).toBeNull();
    expect(normalizePhonetic('/tekst/')).toBe('/tekst/');
    expect(normalizePhonetic('tekst')).toBe('/tekst/');
  });
});
