import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { WordExportEntry, WordbookSummary } from '@leximochi/types';
import { api } from '../lib/api';
import { offlineStore } from '../lib/offline-store';
import type { OfflineWordbookMeta } from '../lib/wordbook-offline';

interface WordbookScreenProps {
  onStartStudy: (mode: 'new' | 'review' | 'spelling', wordbookKey: string) => void;
}

/**
 * 单词页：下载词库用于离线读取、离线查词，并进入在线练习。
 * 离线时仍可查看已下载词库的词条；练习（含判定与调度）需要联网，客户端不自己算分。
 */
export function WordbookScreen({ onStartStudy }: WordbookScreenProps): ReactElement {
  const [books, setBooks] = useState<WordbookSummary[] | null>(null);
  const [downloaded, setDownloaded] = useState<OfflineWordbookMeta[]>([]);
  const [bookKey, setBookKey] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WordExportEntry[]>([]);

  const refreshLocal = useCallback(async () => {
    setDownloaded(await offlineStore.listDownloaded());
  }, []);

  const loadRemote = useCallback(async () => {
    setError(null);
    try {
      const remote = await api.vocabulary.listWordbooks();
      setBooks(remote);
      setBookKey((previous) => previous || (remote[0]?.key ?? ''));
    } catch (caught) {
      setBooks([]);
      setError(`无法连接服务端（${messageOf(caught)}）；已下载的词库仍可离线查看。`);
    }
  }, []);

  useEffect(() => {
    void loadRemote();
    void refreshLocal();
  }, [loadRemote, refreshLocal]);

  async function handleDownload(): Promise<void> {
    if (!bookKey) return;
    setBusy(true);
    setError(null);
    setStatus('正在下载词库…');
    try {
      const result = await offlineStore.sync(bookKey);
      setStatus(
        result.downloaded
          ? `已下载 ${result.wordCount} 条词条（版本 v${result.version}）`
          : `本地已是最新（版本 v${result.version}，${result.wordCount} 条）`,
      );
      await refreshLocal();
    } catch (caught) {
      setStatus(null);
      setError(`下载失败：${messageOf(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSearch(): Promise<void> {
    if (!bookKey) return;
    const found = await offlineStore.search(bookKey, query, 20);
    setResults(found);
    if (found.length === 0) {
      setStatus(query.trim() ? '本地没有匹配的词条（确认该词库已下载）' : null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>单词</Text>
      <Text style={styles.note}>
        已下载的词库可以离线查看词条；学习、复习的判定与调度由服务端完成，需要联网。
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      {books === null ? (
        <ActivityIndicator color={tokens.color.cinnabar} />
      ) : books.length === 0 ? (
        <Text style={styles.note}>暂时读不到词库列表。</Text>
      ) : (
        <View style={styles.section}>
          <Text style={styles.label}>选择词库</Text>
          {books.map((book) => (
            <Pressable
              key={book.key}
              style={[styles.choice, bookKey === book.key ? styles.choiceActive : null]}
              onPress={() => setBookKey(book.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: bookKey === book.key }}
            >
              <Text style={styles.choiceText}>
                {book.name}（{book.wordCount} 词，v{book.version}）
              </Text>
            </Pressable>
          ))}

          <View style={styles.row}>
            <Pressable
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              disabled={busy}
              onPress={() => void handleDownload()}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>下载到本机</Text>
            </Pressable>
            <Pressable
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              disabled={busy}
              onPress={() => onStartStudy('new', bookKey)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>学新词</Text>
            </Pressable>
            <Pressable
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              disabled={busy}
              onPress={() => onStartStudy('spelling', bookKey)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>拼写训练</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>已下载（{downloaded.length}）</Text>
        {downloaded.length === 0 ? (
          <Text style={styles.note}>还没有下载任何词库。</Text>
        ) : (
          downloaded.map((book) => (
            <Text key={book.key} style={styles.meta}>
              {book.name} · v{book.version} · {book.wordCount} 词 · {formatTime(book.downloadedAt)}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>离线查词</Text>
        <TextInput
          style={styles.input}
          value={query}
          placeholder="输入英文，例如 abandon"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          onSubmitEditing={() => void handleSearch()}
        />
        <Pressable style={styles.button} onPress={() => void handleSearch()} accessibilityRole="button">
          <Text style={styles.buttonText}>在本地词库中查找</Text>
        </Pressable>

        {results.map((word) => (
          <View key={word.id} style={styles.result}>
            <Text style={styles.resultWord}>{word.headword}</Text>
            <Text style={styles.meta}>
              {word.senses.map((sense) => sense.definitionZh).join('；') || '（暂无释义）'}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN');
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
  note: { color: tokens.color.inkSoft, fontSize: 13 },
  error: { color: tokens.color.danger, fontSize: 13 },
  status: { color: tokens.color.matcha, fontSize: 13 },
  section: { gap: tokens.space.sm, borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: tokens.space.md },
  label: { fontFamily: 'monospace', fontSize: 12, color: tokens.color.inkSoft, letterSpacing: 1 },
  choice: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.space.sm,
    backgroundColor: '#fff',
  },
  choiceActive: { borderColor: tokens.color.ink },
  choiceText: { color: tokens.color.ink },
  row: { flexDirection: 'row', gap: tokens.space.sm, flexWrap: 'wrap' },
  button: {
    borderWidth: 1,
    borderColor: tokens.color.ink,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.color.ink,
    alignSelf: 'flex-start',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: tokens.color.paper, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    backgroundColor: '#fff',
    color: tokens.color.ink,
  },
  result: { borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: tokens.space.sm },
  resultWord: { fontSize: 18, fontWeight: '600', color: tokens.color.ink },
  meta: { color: tokens.color.inkSoft, fontSize: 13 },
});
