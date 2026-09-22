import { useState, type ReactElement } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { PublicUser } from '@leximochi/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';

export default function App(): ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);

  return (
    <SafeAreaView style={styles.root}>
      {/* RN 0.87 起 Android 强制边到边显示，StatusBar 不再接受 backgroundColor */}
      <StatusBar barStyle="dark-content" />
      {user ? (
        <HomeScreen user={user} onLoggedOut={() => setUser(null)} />
      ) : (
        <LoginScreen onAuthenticated={setUser} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.paper },
});
