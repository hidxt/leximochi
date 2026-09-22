import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { PublicUser } from '@leximochi/types';
import { session } from '../lib/api';

interface HomeScreenProps {
  user: PublicUser;
  onLoggedOut: () => void;
}

export function HomeScreen({ user, onLoggedOut }: HomeScreenProps): ReactElement {
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    await session.logout();
    setBusy(false);
    onLoggedOut();
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>你好，{user.username}</Text>
      <Text style={styles.meta}>账号创建于 {new Date(user.createdAt).toLocaleString('zh-CN')}</Text>
      <Text style={styles.note}>
        单词、口语、听力与宠物将在后续阶段接入；离线学习与同步计划在 Phase 7 实现。
      </Text>

      <Pressable
        style={[styles.button, busy ? styles.buttonDisabled : null]}
        onPress={() => void logout()}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>退出登录</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: tokens.space.lg, backgroundColor: tokens.color.paper },
  title: { fontSize: 26, fontWeight: '700', color: tokens.color.ink },
  meta: { color: tokens.color.inkSoft, marginTop: tokens.space.xs },
  note: { color: tokens.color.inkSoft, marginTop: tokens.space.md, marginBottom: tokens.space.lg },
  button: {
    borderWidth: 1,
    borderColor: tokens.color.cinnabar,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm + 2,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: tokens.color.cinnabar, fontWeight: '600', fontSize: 16 },
});
