import React, { useCallback, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '@/components/GradientFill';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { listHighScores } from '@/db/repository';
import type { HighScoreRecord } from '@/db/types';
import {
  sessionEnded,
  useTournament,
} from '@/context/TournamentContext';
import { useGame } from '@/context/GameContext';
import {
  buildTournamentSetup,
  TOURNAMENT_GAMES,
  TOURNAMENT_LENGTH,
  tournamentCampaignSummary,
  tournamentMaxPoints,
} from '@/game/tournament';

const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI'];

export default function TournamentScreen() {
  const router = useRouter();
  const { session, loading, startTournament, endTournament } = useTournament();
  const { startGame } = useGame();
  const [nameInput, setNameInput] = useState('');
  const [scores, setScores] = useState<HighScoreRecord[]>([]);

  // Refresh the ledger on focus and whenever the session changes (score banked).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listHighScores()
        .then((s) => {
          if (active) setScores(s);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [session]),
  );

  if (loading) return null;

  // ── No active tournament ────────────────────────────────────────────────
  if (!session) {
    return (
      <View style={styles.root}>
        <GradientFill colors={['#0d0804', '#1a1005', '#221508']} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView style={styles.inner} edges={['top', 'bottom']}>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.back, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Main menu"
          >
            <Ionicons name="chevron-back" size={19} color={Colors.gold} />
            <Text style={styles.backText}>Main Menu</Text>
          </Pressable>

          <ScrollView contentContainerStyle={styles.startScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>MDCCCXII</Text>
            <Text style={styles.heroTitle}>TOURNAMENT</Text>
            <View style={styles.divider} />
            <Text style={styles.heroSub}>
              16 campaigns of escalating difficulty.{'\n'}
              Win battles, eliminate opponents, conquer the world.
            </Text>
          </View>

          <View style={styles.startCard}>
            <Text style={styles.startLabel}>COMMANDER'S NAME</Text>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Enter your name"
              placeholderTextColor={Colors.textMuted}
              style={styles.nameInput}
              maxLength={24}
              returnKeyType="done"
              accessibilityLabel="Commander name"
            />
            <Pressable
              style={({ pressed }) => [styles.startBtn, pressed && styles.startBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Begin tournament"
              onPress={() => {
                if (!nameInput.trim()) {
                  Alert.alert('Name required', 'Enter your commander name to begin.');
                  return;
                }
                startTournament(nameInput.trim());
              }}
            >
              <Ionicons name="flag-outline" size={18} color={Colors.bg} />
              <Text style={styles.startBtnText}>BEGIN TOURNAMENT</Text>
            </Pressable>
          </View>

          <HighScoresLedger scores={scores} />

          <Text style={styles.footer}>150 pts per win · 20 pts per kill · 30 pts for most troops</Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Active tournament ────────────────────────────────────────────────────
  const ended = sessionEnded(session);
  const totalPossible = TOURNAMENT_GAMES.reduce(
    (s, d) => s + tournamentMaxPoints(d),
    0,
  );

  const handleStartGame = (gameIndex: number) => {
    const def = TOURNAMENT_GAMES[gameIndex];
    const setup = buildTournamentSetup(def, session.humanName);
    startGame(setup);
    router.push('/game');
  };

  const handleEndTournament = () => {
    Alert.alert(
      'End Tournament',
      'Abandon your current tournament run? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Tournament',
          style: 'destructive',
          onPress: () => {
            endTournament();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={['#0d0804', '#1a1005', '#221508']} style={StyleSheet.absoluteFillObject} />
      <SafeAreaView style={styles.inner} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/')}
            style={({ pressed }) => [styles.back, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Ionicons name="chevron-back" size={19} color={Colors.gold} />
            <Text style={styles.backText}>Menu</Text>
          </Pressable>
          <Text style={styles.headerTitle}>TOURNAMENT</Text>
          <Pressable
            onPress={handleEndTournament}
            style={({ pressed }) => [styles.abandonBtn, pressed && styles.controlPressed]}
            accessibilityRole="button"
            accessibilityLabel="Abandon tournament"
          >
            <Text style={styles.abandonText}>Abandon</Text>
          </Pressable>
        </View>

        {/* Score bar */}
        <View style={styles.scoreBar}>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreName}>{session.humanName}</Text>
            <Text style={styles.scoreLabel}>COMMANDER</Text>
          </View>
          <View style={styles.scoreItem}>
            <Text style={styles.scorePoints}>{session.totalPoints}</Text>
            <Text style={styles.scoreLabel}>POINTS</Text>
          </View>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreGame}>
              {ended
                ? session.currentGame >= TOURNAMENT_LENGTH
                  ? 'COMPLETE'
                  : 'ELIMINATED'
                : `${session.currentGame + 1} / ${TOURNAMENT_LENGTH}`}
            </Text>
            <Text style={styles.scoreLabel}>CAMPAIGN</Text>
          </View>
        </View>

        {/* Game list */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {TOURNAMENT_GAMES.map((def, idx) => {
            const record = session.records.find((r) => r.gameIndex === idx);
            const isCurrent = idx === session.currentGame && !ended;
            const isLocked = idx > session.currentGame || (ended && !record);
            const summary = tournamentCampaignSummary(def);

            return (
              <Pressable
                key={def.index}
                style={[
                  styles.gameRow,
                  isCurrent && styles.gameRowCurrent,
                  isLocked && styles.gameRowLocked,
                  record && !record.result.progressed && styles.gameRowElim,
                ]}
                onPress={() => isCurrent && handleStartGame(idx)}
                disabled={!isCurrent}
                accessibilityRole="button"
                accessibilityLabel={`${def.title}. ${isCurrent ? 'Play campaign' : isLocked ? 'Locked campaign' : 'Completed campaign'}`}
                accessibilityState={{ disabled: !isCurrent }}
              >
                {/* Roman numeral */}
                <Text style={[styles.roman, isCurrent && styles.romanCurrent]}>
                  {ROMAN[idx]}
                </Text>

                {/* Title + meta */}
                <View style={styles.gameInfo}>
                  <Text
                    style={[styles.gameTitle, isLocked && styles.gameTitleLocked]}
                    numberOfLines={1}
                  >
                    {def.title}
                  </Text>
                  <Text style={styles.gameMeta} numberOfLines={1}>
                    {summary.objectiveName} · {summary.allocationName}
                  </Text>
                  <Text style={styles.gameSubMeta} numberOfLines={1}>
                    {summary.opponentCount} generals {summary.difficultyMarks}
                    {' · '}
                    {summary.territoryCount} territories
                  </Text>
                </View>

                {/* Status badge */}
                {record ? (
                  <View style={styles.badgeWrap}>
                    <Text
                      style={[
                        styles.badge,
                        record.result.won
                          ? styles.badgeWin
                          : record.result.eliminated
                          ? styles.badgeElim
                          : styles.badgeProgress,
                      ]}
                    >
                      {record.result.won
                        ? 'WIN'
                        : record.result.eliminated
                        ? 'OUT'
                        : 'SURVIVED'}
                    </Text>
                    <Text style={styles.badgePts}>+{record.result.points}</Text>
                  </View>
                ) : isCurrent ? (
                  <View style={styles.playNow}>
                    <Ionicons name="play" size={13} color={Colors.gold} />
                    <Text style={styles.playNowText}>PLAY</Text>
                  </View>
                ) : (
                  <Text style={styles.lockedPts}>max {summary.maxPoints}</Text>
                )}
              </Pressable>
            );
          })}

          {/* Final score if ended */}
          {ended && (
            <View style={styles.finalCard}>
              {session.currentGame >= TOURNAMENT_LENGTH ? (
                <>
                  <View style={styles.finalTitleRow}>
                    <Ionicons name="trophy-outline" size={22} color={Colors.gold} />
                    <Text style={styles.finalTitle}>TOURNAMENT COMPLETE</Text>
                  </View>
                  <Text style={styles.finalScore}>
                    {session.totalPoints} / {totalPossible} points
                  </Text>
                  <Text style={styles.finalRating}>{rating(session.totalPoints, totalPossible)}</Text>
                </>
              ) : (
                <>
                  <View style={styles.finalTitleRow}>
                    <Ionicons name="close-circle-outline" size={22} color={Colors.textCrimson} />
                    <Text style={[styles.finalTitle, { color: Colors.textCrimson }]}>ELIMINATED</Text>
                  </View>
                  <Text style={styles.finalScore}>
                    {session.totalPoints} pts after {session.currentGame} campaign
                    {session.currentGame !== 1 ? 's' : ''}
                  </Text>
                </>
              )}
              <Pressable
                style={({ pressed }) => [styles.newRunBtn, pressed && styles.controlPressed]}
                onPress={endTournament}
                accessibilityRole="button"
                accessibilityLabel="New tournament run"
              >
                <Text style={styles.newRunText}>NEW TOURNAMENT RUN</Text>
              </Pressable>
            </View>
          )}

          <HighScoresLedger scores={scores} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** The 12-slot high-score ledger, seeded with the great commanders of history. */
function HighScoresLedger({ scores }: { scores: HighScoreRecord[] }) {
  if (scores.length === 0) return null;
  return (
    <View style={styles.scoresCard}>
      <View style={styles.scoresHeader}>
        <Text style={styles.scoresTitle}>HIGH SCORES</Text>
        <View style={styles.scoresRule} />
      </View>
      {scores.map((score, i) => (
        <View
          key={`${score.name}-${i}`}
          style={[styles.scoreRow, score.isHuman && styles.scoreRowHuman]}
        >
          <Text style={styles.scoreRank}>{i + 1}.</Text>
          <Text style={styles.scoreRowName} numberOfLines={1}>
            {i === 0 ? '★ ' : ''}
            {score.name}
          </Text>
          <Text style={styles.scoreKind}>{score.isHuman ? 'HUMAN' : 'AI'}</Text>
          <Text style={styles.scoreValue}>
            {score.score} pts · {score.gamesCompleted} games
          </Text>
        </View>
      ))}
    </View>
  );
}

function rating(pts: number, max: number): string {
  const pct = pts / max;
  if (pct >= 0.9) return 'EMPEROR';
  if (pct >= 0.75) return 'FIELD MARSHAL';
  if (pct >= 0.55) return 'GENERAL';
  if (pct >= 0.35) return 'COLONEL';
  return 'LIEUTENANT';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1 },

  back: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.36)',
    backgroundColor: 'rgba(21,13,9,0.18)',
    paddingHorizontal: 10,
  },
  iconBtnPressed: { opacity: 0.72 },
  controlPressed: { opacity: 0.78 },
  backText: { color: Colors.gold, fontFamily: 'Alegreya_500Medium', fontSize: 13 },

  heroBlock: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  heroLabel: { color: Colors.goldDim, fontFamily: 'Alegreya_500Medium', fontSize: 11, letterSpacing: 6 },
  heroTitle: { color: Colors.gold, fontFamily: 'IMFellEnglishSC_400Regular', fontSize: 44, letterSpacing: 6 },
  divider: { width: 60, height: 1, backgroundColor: Colors.gold, opacity: 0.4 },
  heroSub: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  startCard: { margin: 24, gap: 12 },
  startLabel: { color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11, letterSpacing: 3 },
  nameInput: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
    color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 16,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  startBtn: {
    minHeight: 52,
    backgroundColor: Colors.gold,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  startBtnPressed: { opacity: 0.82 },
  startBtnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 14, letterSpacing: 3 },

  footer: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10, textAlign: 'center', paddingBottom: 12, letterSpacing: 1 },

  // Active tournament
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { color: Colors.gold, fontFamily: 'IMFellEnglishSC_400Regular', fontSize: 14, letterSpacing: 4 },
  abandonBtn: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(186,38,43,0.34)',
    backgroundColor: 'rgba(117,21,27,0.12)',
    paddingHorizontal: 12,
  },
  abandonText: { color: Colors.textCrimson, fontFamily: 'Alegreya_500Medium', fontSize: 12 },

  scoreBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.bgCard, marginBottom: 4,
  },
  scoreItem: { alignItems: 'center', gap: 2 },
  scoreName: { color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 15 },
  scorePoints: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 22 },
  scoreGame: { color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 15 },
  scoreLabel: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 2 },

  scroll: { flex: 1 },
  list: { padding: 12, gap: 6, paddingBottom: 40 },

  gameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgCard, padding: 12,
  },
  gameRowCurrent: { borderColor: Colors.gold, backgroundColor: '#1e1508' },
  gameRowLocked: { opacity: 0.45 },
  gameRowElim: { borderColor: Colors.crimson },

  roman: { color: Colors.textMuted, fontFamily: 'Alegreya_700Bold', fontSize: 12, minWidth: 28, textAlign: 'right' },
  romanCurrent: { color: Colors.gold },

  gameInfo: { flex: 1, gap: 2 },
  gameTitle: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 14 },
  gameTitleLocked: { color: Colors.textMuted },
  gameMeta: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10 },
  gameSubMeta: { color: Colors.goldDim, fontFamily: 'Alegreya_400Regular', fontSize: 10 },

  badgeWrap: { alignItems: 'flex-end', gap: 2 },
  badge: { fontFamily: 'Alegreya_700Bold', fontSize: 10, letterSpacing: 2 },
  badgeWin: { color: Colors.gold },
  badgeElim: { color: Colors.textCrimson },
  badgeProgress: { color: '#6ab' },
  badgePts: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 11 },

  playNow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playNowText: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 13, letterSpacing: 2 },
  lockedPts: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 11 },

  finalCard: {
    marginTop: 16, borderWidth: 1, borderColor: Colors.gold,
    backgroundColor: '#1e1508', padding: 24, alignItems: 'center', gap: 10,
  },
  finalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  finalTitle: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 20, letterSpacing: 3 },
  finalScore: { color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 15 },
  finalRating: { color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 13, letterSpacing: 3 },
  newRunBtn: {
    minHeight: 44,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  newRunText: { color: Colors.textMuted, fontFamily: 'Alegreya_600SemiBold', fontSize: 12, letterSpacing: 2 },

  // High-score ledger
  startScroll: { flexGrow: 1 },
  scoresCard: {
    marginTop: 16, marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bgCard, padding: 12, gap: 3,
  },
  scoresHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  scoresTitle: { color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11, letterSpacing: 3 },
  scoresRule: { flex: 1, height: 1, backgroundColor: Colors.border },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingVertical: 5 },
  scoreRowHuman: { borderWidth: 1, borderColor: Colors.goldDim, backgroundColor: 'rgba(222,190,115,0.08)' },
  scoreRank: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 11, width: 20 },
  scoreRowName: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 13, flex: 1 },
  scoreKind: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 8, letterSpacing: 1.5 },
  scoreValue: { color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 11, width: 108, textAlign: 'right' },
});
