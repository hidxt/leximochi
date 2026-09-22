import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { PublicUser } from '@leximochi/types';
import { session } from '../lib/api';
import { tokens } from '@leximochi/shared';

interface LoginScreenProps {
  onAuthenticated: (user: PublicUser) => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps): ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const user = await session.login({ username, password });
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>词团子</Text>
      <Text style={styles.subtitle}>登录后继续今天的英语学习</Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.label}>用户名</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="用户名"
      />

      <Text style={styles.label}>密码</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="密码"
      />

      <Pressable
        style={[styles.button, busy ? styles.buttonDisabled : null]}
        onPress={() => void submit()}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={tokens.color.paper} /> : <Text style={styles.buttonText}>登录</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: tokens.space.lg, backgroundColor: tokens.color.paper },
  title: { fontSize: 30, fontWeight: '700', color: tokens.color.ink },
  subtitle: { color: tokens.color.inkSoft, marginTop: tokens.space.xs, marginBottom: tokens.space.lg },
  label: { color: tokens.color.inkSoft, marginBottom: tokens.space.xs },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.surface,
    color: tokens.color.ink,
    marginBottom: tokens.space.md,
  },
  button: {
    backgroundColor: tokens.color.cinnabar,
    borderRadius: tokens.radius.sm,
    paddingVertical: tokens.space.sm + 4,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: tokens.color.paper, fontWeight: '600', fontSize: 16 },
  error: {
    color: tokens.color.danger,
    marginBottom: tokens.space.md,
  },
});
