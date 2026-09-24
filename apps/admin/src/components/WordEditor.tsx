import { useEffect, useState, type ReactElement } from 'react';
import type { AdminWordContentInput } from '@leximochi/api-client';
import type { WordDetail } from '@leximochi/types';

interface WordEditorProps {
  /** 传入则为编辑模式；为空表示新建 */
  initial?: WordDetail | null;
  submitting: boolean;
  onSubmit: (input: AdminWordContentInput) => void;
  onCancel: () => void;
}

/**
 * 词条内容编辑表单。
 * 词典数据以「每行一条」的文本录入，提交前在前端做结构性解析与提示，
 * 语义校验仍由服务端完成（客户端输入永远不可信）。
 */
export function WordEditor({ initial, submitting, onSubmit, onCancel }: WordEditorProps): ReactElement {
  const [headword, setHeadword] = useState('');
  const [phoneticUk, setPhoneticUk] = useState('');
  const [phoneticUs, setPhoneticUs] = useState('');
  const [sensesText, setSensesText] = useState('');
  const [examplesText, setExamplesText] = useState('');
  const [phrasesText, setPhrasesText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHeadword(initial?.headword ?? '');
    setPhoneticUk(initial?.phoneticUk ?? '');
    setPhoneticUs(initial?.phoneticUs ?? '');
    setSensesText(
      (initial?.senses ?? [])
        .map((sense) =>
          [sense.partOfSpeech ?? '', sense.definitionZh, sense.definitionEn ?? '', sense.examMeaning ?? '']
            .join('|')
            .replace(/\|+$/, ''),
        )
        .join('\n'),
    );
    setExamplesText(
      (initial?.examples ?? []).map((example) => `${example.textEn}|${example.textZh}`).join('\n'),
    );
    setPhrasesText(
      (initial?.phrases ?? []).map((phrase) => `${phrase.kind}|${phrase.text}|${phrase.translation}`).join('\n'),
    );
    setError(null);
  }, [initial]);

  function handleSubmit(): void {
    const senses = splitLines(sensesText).map((line) => {
      const [partOfSpeech = '', definitionZh = '', definitionEn = '', examMeaning = ''] = line
        .split('|')
        .map((part) => part.trim());
      return {
        partOfSpeech: partOfSpeech || undefined,
        definitionZh,
        definitionEn: definitionEn || undefined,
        examMeaning: examMeaning || undefined,
      };
    });
    if (senses.length === 0 || senses.some((sense) => sense.definitionZh.length === 0)) {
      setError('每条释义都必须填写中文释义，格式为「词性|中文|英文|常考」');
      return;
    }

    const examples = splitLines(examplesText).map((line) => {
      const [textEn = '', textZh = ''] = line.split('|').map((part) => part.trim());
      return { textEn, textZh };
    });
    if (examples.some((example) => !example.textEn || !example.textZh)) {
      setError('例句格式为「英文|中文」，两项都要填写');
      return;
    }

    const phrases = splitLines(phrasesText).map((line) => {
      const [kind = 'phrase', text = '', translation = ''] = line.split('|').map((part) => part.trim());
      return {
        kind: kind === 'collocation' ? ('collocation' as const) : ('phrase' as const),
        text,
        translation,
      };
    });
    if (phrases.some((phrase) => !phrase.text || !phrase.translation)) {
      setError('短语格式为「类型(phrase/collocation)|短语|释义」，后两项都要填写');
      return;
    }

    setError(null);
    onSubmit({
      headword: headword.trim(),
      phoneticUk: phoneticUk.trim() || undefined,
      phoneticUs: phoneticUs.trim() || undefined,
      senses,
      examples,
      phrases,
    });
  }

  return (
    <div className="editor">
      <p className="page__note">
        词典数据与 AI 补充内容分开存储：这里编辑的是词典字段，AI 生成的记忆技巧不会覆盖它们。
      </p>

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="filters">
        <div className="field">
          <label className="field__label" htmlFor="word-headword">
            词形
          </label>
          <input
            id="word-headword"
            value={headword}
            onChange={(event) => setHeadword(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="word-phonetic-uk">
            英式音标
          </label>
          <input
            id="word-phonetic-uk"
            value={phoneticUk}
            onChange={(event) => setPhoneticUk(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="word-phonetic-us">
            美式音标
          </label>
          <input
            id="word-phonetic-us"
            value={phoneticUs}
            onChange={(event) => setPhoneticUs(event.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="word-senses">
          释义（每行一条：词性|中文|英文|常考含义，仅中文必填）
        </label>
        <textarea
          id="word-senses"
          rows={4}
          value={sensesText}
          placeholder={'v.|放弃；抛弃|to leave behind|常考：放弃计划'}
          onChange={(event) => setSensesText(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="word-examples">
          例句（每行一条：英文|中文）
        </label>
        <textarea
          id="word-examples"
          rows={3}
          value={examplesText}
          placeholder="He abandoned the plan.|他放弃了这个计划。"
          onChange={(event) => setExamplesText(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="word-phrases">
          短语与搭配（每行一条：类型|短语|释义）
        </label>
        <textarea
          id="word-phrases"
          rows={3}
          value={phrasesText}
          placeholder="collocation|abandon oneself to|沉溺于"
          onChange={(event) => setPhrasesText(event.target.value)}
        />
      </div>

      <div className="dialog__actions">
        <button className="button button--quiet" type="button" onClick={onCancel} disabled={submitting}>
          取消
        </button>
        <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
          {initial ? '保存修改' : '创建词条'}
        </button>
      </div>
    </div>
  );
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
