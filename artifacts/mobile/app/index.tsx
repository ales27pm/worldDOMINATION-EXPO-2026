import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Image as RNImage,
  ActivityIndicator, ScrollView, Alert, Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '@/components/GradientFill';
import { useGame } from '@/context/GameContext';
import { loadSaveSummary } from '@/db/repository';
import type { SaveSummary } from '@/db/repository';
import { OBJECTIVE_INFO } from '@/game/types';
import { Colors } from '@/constants/colors';
import { ART } from '@/lib/art';

/** "Saved …" caption: relative for the recent past, date for older saves. */
function formatSavedAt(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'saved just now';
  if (min < 60) return `saved ${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `saved ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'saved yesterday';
  if (days < 7) return `saved ${days} days ago`;
  return `saved ${new Date(t).toLocaleDateString()}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { game, loadingSave, abandonGame } = useGame();
  const [summary, setSummary] = useState<SaveSummary | null>(null);

  // Refresh the save-slot metadata each time the menu regains focus, so the
  // "last saved" caption tracks the autosave that runs during play.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadSaveSummary()
        .then((s) => {
          if (!cancelled) setSummary(s);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Mirrors the web main menu: prefer the live game, fall back to the stored
  // save-slot summary; the saved-at timestamp only exists in the summary.
  const activeGame = game && game.phase !== 'gameOver' ? game : null;
  const continueMeta = activeGame
    ? {
        turn: activeGame.turn,
        objective: OBJECTIVE_INFO[activeGame.setup.objective]?.name ?? 'Campaign',
        names: activeGame.players.filter((p) => p.alive).map((p) => p.name),
      }
    : summary
      ? {
          turn: summary.turn,
          objective: OBJECTIVE_INFO[summary.objective]?.name ?? 'Campaign',
          names: summary.playerNames,
        }
      : null;
  const savedAt = summary?.updatedAt ? formatSavedAt(summary.updatedAt) : null;

  // Confirm before wiping the save slot. RN Alert buttons are a no-op on web,
  // so the Expo web preview falls back to window.confirm.
  const confirmAbandon = useCallback(() => {
    const title = 'Abandon Campaign?';
    const detail = continueMeta
      ? `Turn ${continueMeta.turn} — ${continueMeta.objective}`
      : 'Your saved campaign';
    const message = `${detail} will be permanently erased.`;
    const onConfirm = () => {
      void abandonGame().then(() => {
        // Refresh the save-slot summary so the menu updates immediately.
        loadSaveSummary()
          .then((s) => setSummary(s))
          .catch(() => setSummary(null));
      });
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Abandon', style: 'destructive', onPress: onConfirm },
    ]);
  }, [continueMeta, abandonGame]);

  // Starting a new campaign overwrites the single save slot once the new game
  // autosaves, so confirm first when a saved campaign exists. Same
  // Alert/window.confirm split as confirmAbandon (RN Alert is a no-op on web).
  const confirmNewCampaign = useCallback(() => {
    if (!continueMeta) {
      router.push('/setup');
      return;
    }
    const title = 'Start a New Campaign?';
    const message = `Your saved campaign (Turn ${continueMeta.turn} — ${continueMeta.objective}) will be replaced once the new campaign begins.`;
    const onConfirm = () => router.push('/setup');
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New Campaign', style: 'destructive', onPress: onConfirm },
    ]);
  }, [continueMeta, router]);

  if (loadingSave) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GradientFill
        colors={['#0d0804', '#1a1005', '#221508']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Decorative border lines */}
      <View style={styles.topBorder} />
      <View style={styles.bottomBorder} />

      <SafeAreaView style={styles.inner}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
        {/* Title — the "Anno Domini MDCCCXII" heraldic hall */}
        <View style={styles.titleBlock}>
          <RNImage source={ART.warCrest} style={styles.crest} resizeMode="contain" />
          <Text style={styles.subtitle}>ANNO DOMINI MDCCCXII</Text>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
            WORLD
          </Text>
          <Text
            style={[styles.title, styles.titleCrimson]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            DOMINATION
          </Text>
          <View style={styles.divider} />
          <View style={styles.heroFrame}>
            <RNImage source={ART.heroPainting} style={styles.hero} resizeMode="cover" />
          </View>
          <Text style={styles.tagline}>
            A Napoleonic campaign of global conquest. Muster your regiments, command the field
            with dice and diplomacy, and bend every continent to your banner.
          </Text>
        </View>

        {/* Menu buttons */}
        <View style={styles.menu}>
          {game && continueMeta && (
            <MenuButton
              label="Continue Campaign"
              sub={`Turn ${continueMeta.turn} — ${continueMeta.objective}`}
              subLines={[
                continueMeta.names.slice(0, 3).join(', ')
                  + (continueMeta.names.length > 3 ? '…' : ''),
                ...(savedAt ? [savedAt] : []),
              ]}
              primary
              onPress={() => router.push('/game')}
            />
          )}

          <MenuButton
            label="New Campaign"
            onPress={confirmNewCampaign}
          />

          {game && (
            <MenuButton
              label="Abandon Campaign"
              danger
              onPress={confirmAbandon}
            />
          )}

          <MenuButton
            label="Tournament"
            onPress={() => router.push('/tournament')}
          />

          <MenuButton
            label="Multiplayer Command"
            onPress={() => router.push('/multiplayer' as Href)}
          />

          <MenuButton
            label="Hall of Records"
            onPress={() => router.push('/records')}
          />
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          A faithful port of the RISK II campaign system
        </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function MenuButton({
  label, sub, subLines, onPress, primary, danger,
}: {
  label: string;
  sub?: string;
  subLines?: string[];
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        danger && styles.btnDanger,
        pressed && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnLabel, danger && styles.btnLabelDanger]}>
        {label}
      </Text>
      {sub && <Text style={styles.btnSub}>{sub}</Text>}
      {subLines?.filter(Boolean).map((line, i) => (
        <Text key={i} style={styles.btnSubLine} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loading: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },
  inner: { flex: 1, paddingHorizontal: 32 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  topBorder: { height: 2, backgroundColor: Colors.goldDim, marginTop: 0 },
  bottomBorder: { height: 2, backgroundColor: Colors.goldDim },
  titleBlock: { alignItems: 'center', paddingTop: 16 },
  crest: { width: 110, height: 110, marginBottom: 10 },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    letterSpacing: 6,
    fontFamily: 'IMFellEnglishSC_400Regular',
    marginBottom: 8,
    textShadowColor: 'rgba(21,13,9,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    color: Colors.gold,
    fontSize: 40,
    fontFamily: 'IMFellEnglishSC_400Regular',
    textAlign: 'center',
    letterSpacing: 3,
    lineHeight: 46,
    maxWidth: 330,
    textShadowColor: 'rgba(21,13,9,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  titleCrimson: { color: Colors.textCrimson },
  divider: {
    width: 160,
    height: 1,
    backgroundColor: Colors.gold,
    marginVertical: 18,
    opacity: 0.5,
  },
  heroFrame: {
    borderWidth: 3,
    borderColor: 'rgba(222,190,115,0.6)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 3,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  hero: { width: 280, height: 186 },
  tagline: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Alegreya_400Regular_Italic',
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
  },
  menu: { gap: 10, paddingVertical: 24 },
  btn: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  btnPrimary: { borderColor: Colors.gold, backgroundColor: '#2a1d08' },
  btnDanger: { borderColor: Colors.crimson },
  btnPressed: { opacity: 0.7 },
  btnLabel: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Alegreya_600SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  btnLabelDanger: { color: Colors.textCrimson },
  btnSub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Alegreya_400Regular',
    marginTop: 4,
  },
  btnSubLine: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Alegreya_400Regular_Italic',
    marginTop: 2,
    maxWidth: 280,
  },
  footer: {
    color: Colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    fontFamily: 'Alegreya_400Regular',
    paddingBottom: 16,
    letterSpacing: 1,
  },
});
