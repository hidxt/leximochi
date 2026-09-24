import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { NotebookEntry, ReviewStats } from '@leximochi/types';
import { api } from '../lib/api';

/** 我的：学习统计与生词本（生词本条目可移除） */
export function ProfileScreen(): ReactElement {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [entries, setEntries] = useState<NotebookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [current, notebook] = await Promise.all([api.review.stats(), api.notebook.list({ limit: 30 })]);
      setStats(current);
      setEntries(notebook.items);
    } catch (caught) {
      setError(messageOf(caught));
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(wordId: string): Promise<void> {
    setBusy(true);
    try {
      await api.notebook.remove(wordId);
      await load();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>我的</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {stats === null ? (
        <ActivityIndicator color={tokens.color.cinnabar} />
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>今日</Text>
          <Text style={styles.meta}>
            新学 {stats.learnedToday} · 复习 {stats.reviewedToday} · 正确率{' '}
            {stats.accuracyToday === null ? '—' : `${Math.round(stats.accuracyToday * 100)}%`}
          </Text>
          <Text style={styles.meta}>
            已掌握 {stats.masteredWords} · 学习中 {stats.learningWords} · 生词本 {stats.notebookCount}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>生词本（{entries?.length ?? 0}）</Text>
        {entries === null ? (
          <ActivityIndicator color={tokens.color.cinnabar} />
        ) : entries.length === 0 ? (
          <Text style={styles.meta}>还没有收藏任何词。</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.wordId} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.word}>{entry.headword}</Text>
                <Text style={styles.meta}>{entry.definitionZh ?? '（暂无释义）'}</Text>
              </View>
              <Pressable
                style={[styles.buttonQuiet, busy ? styles.buttonDisabled : null]}
                disabled={busy}
                onPress={() => void remove(entry.wordId)}
                accessibilityRole="button"
              >
                <Text style={styles.buttonQuietText}>移出</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function messageOf(caught: unknown): string {
  if (caught && typeof caught === 'object' && 'message' in caught) {
    return String((caught as { message: unknown }).message);
  }
  return '操作失败';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.paper },
  content: { padding: tokens.space.lg, gap: tokens.space.md },
  title: { fontSize: 24, fontWeight: '700', color: tokens.color.ink },
  error: { color: tokens.color.danger, fontSize: 13 },
  section: { gap: tokens.space.sm, borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: tokens.space.md },
  label: { fontFamily: 'monospace', fontSize: 12, color: tokens.color.inkSoft, letterSpacing: 1 },
  meta: { color: tokens.color.inkSoft, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  rowMain: { flex: 1 },
  word: { fontSize: 18, fontWeight: '600', color: tokens.color.ink },
  buttonQuiet: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.xs,
    paddingHorizontal: tokens.space.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonQuietText: { color: tokens.color.ink },
});
