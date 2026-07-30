import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { useBattleSceneVisible } from '@/lib/battleScenes';
import { TERRITORY_MAP } from '@/game/mapData';
import { campaignEventFeedSnapshot } from '@/game/eventFeed';
import { ALLIANCE_LEVEL_INFO } from '@/game/types';
import type { AllianceLevel, GameAction, GameState } from '@/game/types';
import { missionText } from '@/game/missions';
import BattleReportCard from './BattleReport';
import { Fireworks } from './Fireworks';
import { StatsScreen } from './StatsScreen';

// ─── Handoff Overlay ──────────────────────────────────────────────────────────
export function HandoffOverlay({ game, dispatch }: { game: GameState; dispatch: (a: GameAction) => void }) {
  if (!game.awaitingHandoff) return null;
  const player = game.players[game.currentPlayer];
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View testID="map-decision-sheet" style={styles.sheet}>
          <Text style={styles.handoffTitle}>COMMANDER'S TURN</Text>
          <View style={[styles.colorBar, { backgroundColor: player?.color ?? Colors.gold }]} />
          <Text style={styles.handoffName}>{player?.name}</Text>
          <Text style={styles.handoffPhase}>{game.phase.toUpperCase()} PHASE</Text>
          {player?.mission && (
            <View style={styles.missionBox}>
              <Text style={styles.missionLabel}>SECRET MISSION</Text>
              <Text style={styles.missionText}>{missionText(player.mission, game.players)}</Text>
            </View>
          )}
          <Pressable
            onPress={() => dispatch({ type: 'ACKNOWLEDGE_HANDOFF' })}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>⚔ TAKE COMMAND</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Occupy Overlay ───────────────────────────────────────────────────────────
const OCCUPY_AUTO_MS = 2400;

export function OccupyOverlay({ game, dispatch }: { game: GameState; dispatch: (a: GameAction) => void }) {
  const pending = game.pendingOccupy;
  if (!pending) return null;
  // AI generals resolve their own occupations — never flash the sheet for them.
  if (!game.players[game.currentPlayer]?.isHuman) return null;
  return (
    <OccupyFlow
      // Re-key per conquest so countdown/adjust state resets for each one.
      key={`${pending.from}-${pending.to}-${pending.min}-${pending.max}`}
      game={game}
      pending={pending}
      dispatch={dispatch}
    />
  );
}

/**
 * Post-conquest flow, tuned to keep the campaign moving:
 * - no real choice (min === max): the column marches instantly, no UI;
 * - otherwise a non-blocking toast counts down to "advance in force",
 *   with ADJUST opening the classic stepper sheet.
 */
function OccupyFlow({
  game,
  pending,
  dispatch,
}: {
  game: GameState;
  pending: NonNullable<GameState['pendingOccupy']>;
  dispatch: (a: GameAction) => void;
}) {
  const [adjusting, setAdjusting] = useState(false);
  const sceneVisible = useBattleSceneVisible();
  const firedRef = useRef(false);

  const commit = useCallback(
    (count: number) => {
      if (firedRef.current) return;
      firedRef.current = true;
      dispatch({ type: 'OCCUPY', count });
    },
    [dispatch],
  );

  const noChoice = pending.min >= pending.max;

  // March immediately when the rules leave no decision to make.
  useEffect(() => {
    if (noChoice) commit(pending.max);
  }, [noChoice, commit, pending.max]);

  // Countdown to advancing in force — waits for the battle scene to clear
  // so the player actually sees the toast before it fires.
  useEffect(() => {
    if (noChoice || adjusting || sceneVisible) return;
    const timer = setTimeout(() => commit(pending.max), OCCUPY_AUTO_MS);
    return () => clearTimeout(timer);
  }, [noChoice, adjusting, sceneVisible, commit, pending.max]);

  if (noChoice) return null;

  if (adjusting) {
    return <OccupySheet game={game} pending={pending} onAdvance={commit} />;
  }

  if (sceneVisible) return null; // the toast waits behind the battle scene

  const toName = TERRITORY_MAP[pending.to]?.name ?? pending.to;
  return (
    <View style={styles.toastWrap} pointerEvents="box-none">
      <View style={styles.toast}>
        <View style={styles.toastTextBlock}>
          <Text style={styles.toastTitle}>
            Advancing <Text style={styles.bold}>{pending.max}</Text> into{' '}
            <Text style={styles.bold}>{toName}</Text>
          </Text>
          <CountdownBar />
        </View>
        <Pressable
          onPress={() => setAdjusting(true)}
          style={styles.toastBtn}
          accessibilityLabel="Adjust advancing armies"
        >
          <Text style={styles.toastBtnText}>ADJUST</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CountdownBar() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: OCCUPY_AUTO_MS,
      useNativeDriver: true,
    }).start();
  }, [anim]);
  return (
    <View style={styles.countdownTrack}>
      <Animated.View style={[styles.countdownFill, { transform: [{ scaleX: anim }] }]} />
    </View>
  );
}

function OccupySheet({
  game,
  pending,
  onAdvance,
}: {
  game: GameState;
  pending: NonNullable<GameState['pendingOccupy']>;
  onAdvance: (count: number) => void;
}) {
  // Default to advancing in force.
  const [count, setCount] = useState(pending.max);
  const fromName = TERRITORY_MAP[pending.from]?.name ?? pending.from;
  const toName = TERRITORY_MAP[pending.to]?.name ?? pending.to;
  const fromArmies = game.territories[pending.from]?.armies ?? 0;
  const decrement = () => setCount((c) => Math.max(pending.min, c - 1));
  const increment = () => setCount((c) => Math.min(pending.max, c + 1));
  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.backdrop}>
        <View testID="map-decision-sheet" style={styles.sheet}>
          <Text style={styles.occupyTitle}>OCCUPY TERRITORY</Text>
          <Text style={styles.occupyDesc}>
            March armies from <Text style={styles.bold}>{fromName}</Text> into{' '}
            <Text style={styles.bold}>{toName}</Text>
          </Text>
          <View style={styles.stepperRow}>
            <Pressable onPress={decrement} disabled={count <= pending.min} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepCount}>{count}</Text>
            <Pressable onPress={increment} disabled={count >= pending.max} style={styles.stepBtn}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
            <Text style={styles.stepRange}>of {pending.min}–{pending.max}</Text>
          </View>
          <Text style={styles.sliderHint}>
            Leave {fromArmies - count} armies in {fromName}
          </Text>
          <Pressable
            onPress={() => onAdvance(count)}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>ADVANCE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Proposal Overlay ─────────────────────────────────────────────────────────
export function ProposalOverlay({ game, dispatch }: { game: GameState; dispatch: (a: GameAction) => void }) {
  const proposal = game.pendingProposal;
  if (!proposal) return null;
  const from = game.players[proposal.from];
  const level = ALLIANCE_LEVEL_INFO[proposal.level];
  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.backdrop}>
        <View testID="map-decision-sheet" style={styles.sheet}>
          <Text style={styles.proposalTitle}>DIPLOMATIC DISPATCH</Text>
          <View style={[styles.colorBar, { backgroundColor: from?.color ?? Colors.gold }]} />
          <Text style={styles.proposalName}>{from?.name}</Text>
          <Text style={styles.proposalText}>
            offers you a <Text style={styles.bold}>{level.name}</Text>
          </Text>
          <Text style={styles.proposalDesc}>
            {proposal.level === 1 && 'A basic pact of non-aggression. Territories in your empire and continents are protected.'}
            {proposal.level === 2 && 'A military alliance. Neither party may attack the other\'s territories.'}
            {proposal.level === 3 && 'A grand alliance. Full mutual protection and cooperation.'}
          </Text>
          <View style={styles.proposalBtns}>
            <Pressable
              onPress={() => dispatch({ type: 'RESPOND_PROPOSAL', accept: false })}
              style={styles.refuseBtn}
            >
              <Text style={styles.refuseBtnText}>REFUSE</Text>
            </Pressable>
            <Pressable
              onPress={() => dispatch({ type: 'RESPOND_PROPOSAL', accept: true })}
              style={styles.acceptBtn}
            >
              <Text style={styles.acceptBtnText}>ACCEPT</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Victory Overlay ──────────────────────────────────────────────────────────
export function VictoryOverlay({
  game,
  onExit,
  viewerPlayerId,
}: {
  game: GameState;
  onExit: () => void;
  viewerPlayerId?: number | null;
}) {
  const [showStats, setShowStats] = useState(false);
  if (game.phase !== 'gameOver') return null;
  const winner = game.winner !== null ? game.players[game.winner] : null;
  const coWinners = !winner && game.coWinners ? game.coWinners.map((id) => game.players[id]).filter(Boolean) : [];
  const isSharedWin = coWinners.length > 0;
  const human =
    typeof viewerPlayerId === 'number'
      ? game.players[viewerPlayerId]
      : game.players.find((p) => p.isHuman);
  const playerWon = isSharedWin ? coWinners.some((p) => p.id === human?.id) : winner?.id === human?.id;
  const displayName = isSharedWin ? coWinners.map((p) => p.name).join(' & ') : (winner?.name ?? '?');
  const displayColor = isSharedWin ? (coWinners[0]?.color ?? Colors.gold) : (winner?.color ?? Colors.gold);
  const territoryCount = isSharedWin
    ? game.activeIds.filter((id) => coWinners.some((p) => p.id === game.territories[id].owner)).length
    : winner
      ? game.activeIds.filter((id) => game.territories[id].owner === winner.id).length
      : 0;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        {playerWon && <Fireworks />}
        <View testID="map-victory-sheet" style={[styles.sheet, styles.victorySheet]}>
          <Text style={[styles.victoryResult, playerWon ? styles.victory : styles.defeat]}>
            {isSharedWin ? (playerWon ? '⚔ SHARED VICTORY' : '⚔ SHARED WIN') : playerWon ? '⚔ VICTORY' : '✕ DEFEAT'}
          </Text>
          <View style={[styles.colorBar, { backgroundColor: displayColor }]} />
          <Text style={styles.victoryName}>{displayName}</Text>
          <Text style={styles.victoryReason}>{game.winReason}</Text>

          <View style={styles.statsGrid}>
            <StatItem label="Turns" value={String(game.turn)} />
            <StatItem label="Battles" value={String(game.battlesFought)} />
            <StatItem label="Territories" value={String(territoryCount)} />
          </View>

          <Pressable onPress={() => setShowStats(true)} style={styles.statsBtn}>
            <Text style={styles.statsBtnText}>CAMPAIGN STATISTICS</Text>
          </Pressable>
          <Pressable onPress={onExit} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>RETURN TO MAIN MENU</Text>
          </Pressable>
        </View>
        <StatsScreen game={game} visible={showStats} onClose={() => setShowStats(false)} />
      </View>
    </Modal>
  );
}

// ─── Same Time Battle Playback ────────────────────────────────────────────────
/**
 * Same Time RISK resolves every commander's orders at once — this modal walks
 * through the round's battle reports one at a time so the table can watch the
 * outcome unfold (manual, Chapter 9). Dismissing the last report opens the
 * tactical move phase.
 */
export function SameTimeBattlePlayback({ game, dispatch }: { game: GameState; dispatch: (a: GameAction) => void }) {
  if (game.phase !== 'sameTimeBattle') return null;
  const report = game.sameTime?.playback[0];
  if (!report) return null;
  const remaining = (game.sameTime?.playback.length ?? 1) - 1;
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View testID="map-decision-sheet" style={[styles.sheet, styles.playbackSheet]}>
          <Text style={styles.handoffTitle}>ROUND {game.turn} — BATTLE REPORT</Text>
          <BattleReportCard battle={report} game={game} />
          {remaining > 0 && (
            <Text style={styles.playbackCount}>{remaining} more report{remaining === 1 ? '' : 's'} to review</Text>
          )}
          <Pressable onPress={() => dispatch({ type: 'ST_ACK_PLAYBACK' })} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{remaining > 0 ? 'CONTINUE →' : 'PROCEED TO MOVEMENT →'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Dispatch Log Overlay ─────────────────────────────────────────────────────
export function DispatchLog({ game, visible, onClose }: { game: GameState; visible: boolean; onClose: () => void }) {
  const snapshot = campaignEventFeedSnapshot(game.log, game.log.length);
  const toneColor: Record<string, string> = {
    info: Colors.text,
    gold: Colors.gold,
    crimson: Colors.textCrimson,
    battle: '#e0a050',
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView testID="map-dispatch-sheet" style={styles.dispatchSheet} edges={['bottom']}>
          <View style={styles.dispatchHeader}>
            <Text style={styles.title}>FIELD DISPATCH</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close field dispatch"
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.logContent}>
            {snapshot.showsEmptyState ? (
              <Text style={styles.emptyLogText}>No dispatches yet.</Text>
            ) : (
              snapshot.recentEvents.map((entry) => (
                <View key={entry.id} style={styles.logEntry}>
                  <Text style={styles.logTurn}>T{entry.turn}</Text>
                  <Text style={[styles.logText, { color: toneColor[entry.tone] ?? Colors.text }]}>
                    {entry.text}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: MapHud.scrim, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: MapHud.modal, borderWidth: 1, borderColor: 'rgba(222,190,115,0.35)',
    padding: 24, gap: 14, width: '100%', maxWidth: 400,
  },
  victorySheet: { gap: 16 },
  colorBar: { height: 3, borderRadius: 2, width: '100%' },
  bold: { ...MAP_HUD_TEXT_SHADOW, fontFamily: 'Alegreya_700Bold', color: Colors.text },

  // Handoff
  handoffTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11, letterSpacing: 3, textAlign: 'center' },
  handoffName: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 28, textAlign: 'center' },
  handoffPhase: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12, letterSpacing: 2, textAlign: 'center' },
  missionBox: { backgroundColor: MapHud.control, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 4 },
  missionLabel: { ...MAP_HUD_TEXT_SHADOW, color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 10, letterSpacing: 2 },
  missionText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 13 },

  // Same Time battle playback
  playbackSheet: { gap: 14, alignItems: 'stretch' },
  playbackCount: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12, textAlign: 'center' },

  // Occupy
  occupyTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 16, letterSpacing: 2 },
  occupyDesc: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 14 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderCount: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 28, minWidth: 40, textAlign: 'center' },
  sliderMax: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 14, minWidth: 24, textAlign: 'right' },
  sliderHint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12, textAlign: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  stepBtn: {
    width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: MapHud.control,
  },
  stepBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 22 },
  stepCount: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 36, minWidth: 56, textAlign: 'center' },
  stepRange: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },

  // Occupy toast (non-blocking)
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 178, alignItems: 'center', zIndex: 30 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: MapHud.control, borderWidth: 1, borderColor: 'rgba(222,190,115,0.5)',
    paddingVertical: 10, paddingLeft: 14, paddingRight: 10, maxWidth: '92%',
  },
  toastTextBlock: { gap: 6, flexShrink: 1 },
  toastTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_500Medium', fontSize: 13 },
  countdownTrack: { height: 3, backgroundColor: 'rgba(222,190,115,0.18)', overflow: 'hidden', borderRadius: 2 },
  countdownFill: { height: 3, backgroundColor: Colors.gold, borderRadius: 2 },
  toastBtn: { borderWidth: 1, borderColor: Colors.gold, paddingVertical: 8, paddingHorizontal: 12 },
  toastBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 12, letterSpacing: 2 },

  // Proposal
  proposalTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11, letterSpacing: 3 },
  proposalName: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 22 },
  proposalText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 15 },
  proposalDesc: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 13 },
  proposalBtns: { flexDirection: 'row', gap: 12 },
  refuseBtn: { flex: 1, borderWidth: 1, borderColor: Colors.crimson, paddingVertical: 12, alignItems: 'center' },
  refuseBtnText: { color: Colors.textCrimson, fontFamily: 'Alegreya_700Bold', fontSize: 13, letterSpacing: 2 },
  acceptBtn: { flex: 1, backgroundColor: Colors.gold, paddingVertical: 12, alignItems: 'center' },
  acceptBtnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 13, letterSpacing: 2 },

  // Victory
  victoryResult: { ...MAP_HUD_TEXT_SHADOW, fontFamily: 'Alegreya_700Bold', fontSize: 32, textAlign: 'center', letterSpacing: 4 },
  victory: { color: Colors.gold },
  defeat: { color: Colors.textMuted },
  victoryName: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 24, textAlign: 'center' },
  victoryReason: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 13, textAlign: 'center' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 22 },
  statLabel: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10, letterSpacing: 1 },

  // Common buttons
  statsBtn: { borderWidth: 1, borderColor: Colors.gold, paddingVertical: 12, alignItems: 'center' },
  statsBtnText: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 13, letterSpacing: 2 },
  primaryBtn: { backgroundColor: Colors.gold, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 14, letterSpacing: 3 },

  // Dispatch log
  dispatchSheet: { backgroundColor: MapHud.modal, borderTopWidth: 1, borderTopColor: Colors.border, maxHeight: '70%' },
  dispatchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 14, letterSpacing: 3 },
  closeText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontSize: 18, padding: 4 },
  logContent: { padding: 16, gap: 8 },
  logEntry: { flexDirection: 'row', gap: 8 },
  logTurn: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10, minWidth: 24, paddingTop: 2 },
  logText: { ...MAP_HUD_TEXT_SHADOW, flex: 1, fontFamily: 'Alegreya_400Regular', fontSize: 13, lineHeight: 18 },
  emptyLogText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular_Italic', fontSize: 13 },
});
