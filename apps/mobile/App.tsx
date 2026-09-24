import { useState, type ReactElement } from 'react';
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@leximochi/shared';
import type { PublicUser, StudyMode } from '@leximochi/types';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { WordbookScreen } from './src/screens/WordbookScreen';
import { WordStudyScreen } from './src/screens/WordStudyScreen';

type Tab = 'home' | 'words' | 'me';

interface StudyState {
  mode: StudyMode;
  wordbookKey: string;
}

export default function App(): ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [study, setStudy] = useState<StudyState | null>(null);

  function handleLoggedOut(): void {
    setUser(null);
    setTab('home');
    setStudy(null);
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* RN 0.87 起 Android 强制边到边显示，StatusBar 不再接受 backgroundColor */}
      <StatusBar barStyle="dark-content" />
      {user === null ? (
        <LoginScreen onAuthenticated={setUser} />
      ) : study ? (
        <WordStudyScreen
          mode={study.mode}
          wordbookKey={study.wordbookKey}
          onExit={() => setStudy(null)}
        />
      ) : (
        <>
          <View style={styles.body}>
            {tab === 'home' ? (
              <HomeScreen user={user} onLoggedOut={handleLoggedOut} />
            ) : tab === 'words' ? (
              <WordbookScreen
                onStartStudy={(mode, wordbookKey) => setStudy({ mode, wordbookKey })}
              />
            ) : (
              <ProfileScreen />
            )}
          </View>

          {/* 一级导航：首页 / 单词 / 我的；口语与听力属于后续阶段，不建空页面 */}
          <View style={styles.tabs}>
            {(
              [
                ['home', '首页'],
                ['words', '单词'],
                ['me', '我的'],
              ] as Array<[Tab, string]>
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={styles.tab}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
              >
                <Text style={[styles.tabText, tab === key ? styles.tabTextActive : null]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.paper },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: tokens.space.sm },
  tabText: { color: tokens.color.inkSoft, fontSize: 14 },
  tabTextActive: { color: tokens.color.cinnabar, fontWeight: '700' },
});
