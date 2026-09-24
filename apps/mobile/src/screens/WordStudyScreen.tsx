import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { StudyMode, StudyNextResponse, SubmitReviewResponse } from '@leximochi/types';
import { api } from '../lib/api';

interface WordStudyScreenProps {
  mode: StudyMode;
  wordbookKey: string;
  onExit: () => void;
}

function newEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 练习界面（新词 / 复习 / 拼写 / 听写）。
 * 只上报答题事实，判定与调度由服务端返回；题目本身不含正确答案。
 */
export function WordStudyScreen({ mode, wordbookKey, onExit }: WordStudyScreenProps): ReactElement {
  const [payload, setPayload] = useState<StudyNextResponse | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<SubmitReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eventId, setEventId] = useState(newEventId);
  const [startedAt, setStartedAt] = useState(Date.now());

  const loadNext = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setAnswer('');
    try {
      const next = await api.review.next({ mode, wordbookKey: wordbookKey || undefined });
      setPayload(next);
      setEventId(newEventId());
      setStartedAt(Date.now());
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, [mode, wordbookKey]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  async function submit(): Promise<void> {
    const question = payload?.question;
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      const submitted = await api.review.submit({
        eventId,
        wordId: question.wordId,
        questionType: question.questionType,
        answer,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      setResult(submitted);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  async function addToNotebook(): Promise<void> {
    const question = payload?.question;
    if (!question) return;
    try {
      await api.notebook.add({ wordId: question.wordId, source: 'from_review' });
      setError(null);
      setResult((current) => (current ? { ...current } : current));
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  const question = payload?.question ?? null;
  const notice = payload?.notice ?? null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{modeLabel(mode)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {payload === null ? (
        <ActivityIndicator color={tokens.color.cinnabar} />
      ) : question === null ? (
        <View style={styles.section}>
          <Text style={styles.note}>{notice ?? '当前没有需要练习的内容。'}</Text>
          <Pressable style={styles.button} onPress={onExit} accessibilityRole="button">
            <Text style={styles.buttonText}>返回</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.headword}>{question.prompt}</Text>
          {question.phonetic ? <Text style={styles.meta}>{question.phonetic}</Text> : null}

          {question.questionType === 'listening_dictation' ? (
            <Text style={styles.note}>
              {question.audioKey
                ? '音频播放将在听力阶段接入；当前可先按音标拼写。'
                : '这个词没有可播放的音频，先按音标拼写。'}
            </Text>
          ) : null}

          {question.options.length > 0 ? (
            question.options.map((option) => (
              <Pressable
                key={option}
                style={[styles.choice, answer === option ? styles.choiceActive : null]}
                disabled={Boolean(result)}
                onPress={() => setAnswer(option)}
                accessibilityRole="button"
              >
                <Text style={styles.choiceText}>{option}</Text>
              </Pressable>
            ))
          ) : (
            <TextInput
              style={styles.input}
              value={answer}
              editable={!result}
              placeholder="输入答案"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setAnswer}
              onSubmitEditing={() => void submit()}
            />
          )}

          {result ? (
            <View style={styles.section}>
              <Text style={result.correct ? styles.status : styles.error}>
                {result.correct ? '答对了' : `答错了，正确答案：${result.correctAnswer}`}
              </Text>
              <Text style={styles.meta}>
                复习次数 {result.state.totalReviews} · 正确 {result.state.correctReviews} · 下次到期{' '}
                {new Date(result.state.dueAt ?? Date.now()).toLocaleString('zh-CN')}
              </Text>
            </View>
          ) : null}

          <Text style={styles.meta}>
            进度：今日新学 {payload.progress.learnedToday}/{payload.progress.dailyNewTarget} · 今日复习{' '}
            {payload.progress.reviewedToday} · 待复习 {payload.progress.dueRemaining}
          </Text>

          <View style={styles.row}>
            {result ? (
              <Pressable style={styles.button} onPress={() => void loadNext()} accessibilityRole="button">
                <Text style={styles.buttonText}>下一题</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.button, busy || answer.trim().length === 0 ? styles.buttonDisabled : null]}
                disabled={busy || answer.trim().length === 0}
                onPress={() => void submit()}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>提交答案</Text>
              </Pressable>
            )}
            {result && !result.correct ? (
              <Pressable style={styles.buttonQuiet} onPress={() => void addToNotebook()} accessibilityRole="button">
                <Text style={styles.buttonQuietText}>加入生词本</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.buttonQuiet} onPress={onExit} accessibilityRole="button">
              <Text style={styles.buttonQuietText}>结束本轮</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function modeLabel(mode: StudyMode): string {
  switch (mode) {
    case 'new':
      return '新词学习';
    case 'review':
      return '到期复习';
    case 'spelling':
      return '拼写训练';
    default:
      return '听写训练';
  }
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.paper },
  content: { padding: tokens.space.lg, gap: tokens.space.sm },
  label: { fontFamily: 'monospace', fontSize: 12, color: tokens.color.inkSoft, letterSpacing: 1 },
  headword: { fontSize: 32, fontWeight: '700', color: tokens.color.ink },
  note: { color: tokens.color.inkSoft, fontSize: 13 },
  meta: { color: tokens.color.inkSoft, fontSize: 13 },
  error: { color: tokens.color.danger, fontSize: 14 },
  status: { color: tokens.color.matcha, fontSize: 14 },
  section: { gap: tokens.space.sm, borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: tokens.space.md },
  choice: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.space.sm,
    backgroundColor: '#fff',
  },
  choiceActive: { borderColor: tokens.color.ink },
  choiceText: { color: tokens.color.ink },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    backgroundColor: '#fff',
    color: tokens.color.ink,
  },
  row: { flexDirection: 'row', gap: tokens.space.sm, flexWrap: 'wrap', marginTop: tokens.space.sm },
  button: {
    borderWidth: 1,
    borderColor: tokens.color.cinnabar,
    backgroundColor: tokens.color.cinnabar,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: tokens.color.paper, fontWeight: '600' },
  buttonQuiet: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
  },
  buttonQuietText: { color: tokens.color.ink, fontWeight: '500' },
});
