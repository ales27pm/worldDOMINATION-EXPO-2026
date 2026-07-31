import React, { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { View, Text, StyleSheet, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Colors } from "@/constants/colors";
import { MAP_HUD_TEXT_SHADOW, MapHud } from "@/constants/mapHud";
import type { BattleReport, GameState } from "@/game/types";
import { TERRITORY_MAP } from "@/game/mapData";
import { battlePresentationSummary } from "@/game/battlePresentation";
import { useBattleSceneVisible } from "@/lib/battleScenes";
import { RiskDie } from "./RiskDie";

interface Props {
  battle: BattleReport;
  game: GameState;
}

/** How long the recap card lingers on screen after a battle. */
const LINGER_MS = 6500;

/**
 * Auto-hiding wrapper for the LAST BATTLE card. Only battles involving the
 * human surface it — enemy skirmishes are narrated by the on-map arrows and
 * the ticker instead, keeping the chrome light during AI turns. The card
 * snapshots its report (the engine clears `lastBattle` at turn advance) and
 * its countdown pauses while the cinematic covers the screen or an occupy
 * decision is pending, so the recap is still readable afterwards. Tap
 * dismisses it early. Display-only — engine state is untouched.
 */
export function TransientBattleReport({
  game,
  style,
}: {
  game: GameState;
  style?: StyleProp<ViewStyle>;
}) {
  const report = game.phase === "attack" ? game.lastBattle : null;
  const involvesHuman =
    report != null &&
    (game.players[report.attacker]?.isHuman || game.players[report.defender]?.isHuman);
  // The reducer deep-clones state on every dispatch, so the report's object
  // identity changes even when no new battle happened (e.g. the occupy
  // auto-advance). Key each battle by the monotonic battlesFought counter
  // instead, or unrelated dispatches would re-surface a dismissed card.
  const battleKey = involvesHuman ? game.battlesFought : null;
  const sceneVisible = useBattleSceneVisible();
  const occupyPending = game.pendingOccupy != null;
  const [shown, setShown] = useState<{ key: number; report: BattleReport } | null>(null);

  // A new battle re-surfaces the card, even if the previous one was
  // dismissed; leaving the attack phase clears it. AI-vs-AI battles neither
  // surface nor clear it.
  useEffect(() => {
    if (game.phase !== "attack") {
      setShown(null);
      return;
    }
    if (battleKey !== null && report) setShown({ key: battleKey, report });
    // report is keyed by battleKey — its identity churns on every dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleKey, game.phase]);

  // Linger countdown — only ticks while the card is actually readable (not
  // under the battle cinematic, not during an occupy decision).
  useEffect(() => {
    if (!shown || sceneVisible || occupyPending) return;
    const timer = setTimeout(() => setShown(null), LINGER_MS);
    return () => clearTimeout(timer);
  }, [shown, sceneVisible, occupyPending]);

  if (!shown) return null;
  return (
    <Pressable
      style={style}
      onPress={() => setShown(null)}
      accessibilityRole="button"
      accessibilityLabel="Dismiss battle report"
    >
      <BattleReportCard battle={shown.report} game={game} />
    </Pressable>
  );
}

/** Compact inline battle result card shown above the action panel. */
export default function BattleReportCard({ battle, game }: Props) {
  const attacker = game.players[battle.attacker];
  const defender = game.players[battle.defender];
  const summary = battlePresentationSummary(battle);

  return (
    <View testID="map-battle-report" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>LAST BATTLE</Text>
        <Text
          style={[
            styles.result,
            battle.conquered ? styles.conquered : styles.repelled,
          ]}
        >
          {battle.conquered ? "CONQUERED" : "REPELLED"}
        </Text>
      </View>

      <View style={styles.battle}>
        {/* Attacker */}
        <View style={styles.side}>
          <View
            style={[styles.colorDot, { backgroundColor: attacker?.color ?? "#888" }]}
          />
          <Text style={styles.playerName} numberOfLines={1}>
            {attacker?.name ?? "?"}
          </Text>
          <Text style={styles.territory}>
            {TERRITORY_MAP[battle.from]?.name ?? battle.from}
          </Text>
          <View style={styles.dice}>
            {battle.attackerRolls.map((v, i) => (
              <RiskDie key={i} value={v} tier={battle.attackerTier} size={30} />
            ))}
          </View>
          <Text style={styles.losses}>-{battle.attackerLosses}</Text>
        </View>

        <View style={styles.vsCol}>
          <Ionicons name="flash-outline" size={18} color={Colors.gold} />
          <Text style={styles.rounds}>{battle.rounds}r</Text>
        </View>

        {/* Defender */}
        <View style={styles.side}>
          <View
            style={[styles.colorDot, { backgroundColor: defender?.color ?? "#888" }]}
          />
          <Text style={styles.playerName} numberOfLines={1}>
            {defender?.name ?? "?"}
          </Text>
          <Text style={styles.territory}>
            {TERRITORY_MAP[battle.to]?.name ?? battle.to}
          </Text>
          <View style={styles.dice}>
            {battle.defenderRolls.map((v, i) => (
              <RiskDie key={i} value={v} tier={battle.defenderTier} size={30} />
            ))}
          </View>
          <Text style={styles.losses}>-{battle.defenderLosses}</Text>
        </View>
      </View>

      {summary && (
        <View style={styles.outlook}>
          <Text style={styles.outlookLabel}>OUTLOOK</Text>
          <Text
            style={[
              styles.outlookValue,
              summary.outlook === "attacker" ? styles.conquered : summary.outlook === "defender" ? styles.repelled : styles.even,
            ]}
            numberOfLines={1}
          >
            {summary.outlookLabel.toUpperCase()} · {summary.attackerPressurePct}%
          </Text>
          <Text style={styles.outlookMeta} numberOfLines={1}>
            force {summary.attackerStart}-{summary.defenderStart} · standing {summary.attackerRemaining}-{summary.defenderRemaining}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: MapHud.focused,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.35)',
    padding: 10,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: "Alegreya_500Medium",
    fontSize: 10,
    letterSpacing: 2,
  },
  result: { ...MAP_HUD_TEXT_SHADOW, fontFamily: "Alegreya_700Bold", fontSize: 11, letterSpacing: 2 },
  conquered: { color: Colors.gold },
  repelled: { color: Colors.textMuted },
  battle: { flexDirection: "row", alignItems: "center", gap: 8 },
  side: { flex: 1, alignItems: "center", gap: 4 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  playerName: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.text,
    fontFamily: "Alegreya_600SemiBold",
    fontSize: 12,
  },
  territory: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: "Alegreya_400Regular",
    fontSize: 10,
    textAlign: "center",
  },
  dice: { flexDirection: "row", gap: 4 },
  losses: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textCrimson,
    fontFamily: "Alegreya_700Bold",
    fontSize: 14,
  },
  outlook: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(222,190,115,0.2)',
    paddingTop: 7,
    gap: 2,
  },
  outlookLabel: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: "Alegreya_500Medium",
    fontSize: 9,
    letterSpacing: 2,
  },
  outlookValue: {
    ...MAP_HUD_TEXT_SHADOW,
    fontFamily: "Alegreya_700Bold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  even: { color: Colors.goldDim },
  outlookMeta: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: "Alegreya_400Regular",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  vsCol: { alignItems: "center", gap: 2 },
  rounds: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: "Alegreya_400Regular",
    fontSize: 10,
  },
});
