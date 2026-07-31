import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import type { GameAction, GameState } from '@/game/types';
import { ALLIANCE_LEVEL_INFO } from '@/game/types';
import { allianceBetween, wholeContinents } from '@/game/analysis';
import { CONTINENTS } from '@/game/mapData';

interface Props {
  game: GameState;
  compact?: boolean;
  /** When provided (and I-Com is available), lets the human propose a pact or send a threat. */
  dispatch?: (action: GameAction) => void;
}

/** I-Com (manual, Chapter 9): only ever available with exactly one human commander at the table. */
function iComAvailable(game: GameState): boolean {
  return (
    (game.phase === 'reinforcement' || game.phase === 'sameTimeReinforce') &&
    game.players.filter((p) => p.isHuman && p.alive).length === 1
  );
}

export default function PlayerRoster({ game, compact, dispatch }: Props) {
  const human = game.players.find((p) => p.isHuman && p.alive);
  const iComOpen = Boolean(dispatch) && iComAvailable(game);

  return (
    <View style={compact ? styles.compactContainer : styles.container}>
      {game.players.map((player) => {
        const owned = game.activeIds.filter((id) => game.territories[id].owner === player.id).length;
        const troops = game.activeIds.reduce(
          (sum, id) => game.territories[id].owner === player.id ? sum + game.territories[id].armies : sum, 0,
        );
        const continents = wholeContinents(game, player.id);
        const isCurrentPlayer = game.currentPlayer === player.id;
        const cards = player.cards.length;
        const pact = human && !player.isHuman ? allianceBetween(game, human.id, player.id) : null;
        const canApproach =
          iComOpen && human && !player.isHuman && player.alive && !pact && !game.proposalsMade.includes(player.id);

        if (compact) {
          return (
            <View key={player.id} style={[styles.compactRow, !player.alive && styles.eliminated]}>
              <View style={[styles.colorDot, { backgroundColor: player.color }]} />
              <Text style={[styles.compactName, isCurrentPlayer && styles.active]} numberOfLines={1}>
                {player.name}
              </Text>
              <Text style={styles.compactStat}>{owned}t</Text>
              <Text style={styles.compactStat}>{troops}a</Text>
            </View>
          );
        }

        return (
          <View
            key={player.id}
            style={[styles.card, isCurrentPlayer && styles.cardActive, !player.alive && styles.cardEliminated]}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.colorBar, { backgroundColor: player.color }]} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, !player.alive && styles.deadName]} numberOfLines={1}>
                    {player.name}
                  </Text>
                  {isCurrentPlayer && <Text style={styles.activeBadge}>▶ ACTIVE</Text>}
                  {!player.alive && <Text style={styles.deadBadge}>ELIMINATED</Text>}
                  {player.isHuman && <Text style={styles.humanBadge}>HUMAN</Text>}
                </View>
                {player.capital && (game.capitalsRevealed || player.id === human?.id) && (
                  <View style={styles.capitalRow}>
                    <Ionicons name="flag-outline" size={12} color={Colors.textMuted} />
                    <Text style={styles.capitalText}>{player.capital}</Text>
                  </View>
                )}
              </View>
            </View>
            {player.alive && (
              <View style={styles.statsRow}>
                <Stat label="Territories" value={String(owned)} />
                <Stat label="Armies" value={String(troops)} />
                <Stat label="Cards" value={String(cards)} />
              </View>
            )}
            {continents.length > 0 && (
              <View style={styles.continentsRow}>
                {continents.map((c) => (
                  <View key={c} style={[styles.continentBadge, { backgroundColor: CONTINENTS[c].color + '40' }]}>
                    <Text style={styles.continentText}>{CONTINENTS[c].name} +{CONTINENTS[c].bonus}</Text>
                  </View>
                ))}
              </View>
            )}
            {pact && (
              <View style={styles.pactRow}>
                <Ionicons name="people-outline" size={12} color={Colors.gold} />
                <Text style={styles.pactText}>{ALLIANCE_LEVEL_INFO[pact.level].name} in effect</Text>
              </View>
            )}
            {canApproach && dispatch && (
              <View style={styles.iComRow}>
                <Pressable
                  style={({ pressed }) => [styles.iComBtn, styles.iComBtnDanger, pressed && styles.controlPressed]}
                  onPress={() => dispatch({ type: 'SEND_THREAT', target: player.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Threaten ${player.name}`}
                >
                  <Ionicons name="warning-outline" size={14} color={Colors.textCrimson} />
                  <Text style={[styles.iComBtnText, styles.iComBtnTextDanger]}>Threaten</Text>
                </Pressable>
                {([1, 2, 3] as const).map((level) => (
                  <Pressable
                    key={level}
                    style={({ pressed }) => [styles.iComBtn, pressed && styles.controlPressed]}
                    onPress={() => dispatch({ type: 'PROPOSE_ALLIANCE', target: player.id, level })}
                    accessibilityRole="button"
                    accessibilityLabel={`Offer pact level ${level} to ${player.name}`}
                  >
                    <Ionicons name="people-outline" size={14} color={Colors.gold} />
                    <Text style={styles.iComBtnText}>Pact {level}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  compactContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  compactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: MapHud.control, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  compactName: { ...MAP_HUD_TEXT_SHADOW, flex: 1, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 11 },
  compactStat: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10 },
  active: { color: Colors.gold },
  eliminated: { opacity: 0.4 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  card: {
    backgroundColor: MapHud.control, borderWidth: 1, borderColor: Colors.border,
    padding: 10, gap: 6,
  },
  cardActive: { borderColor: Colors.gold },
  cardEliminated: { opacity: 0.45 },
  cardHeader: { flexDirection: 'row', gap: 8 },
  colorBar: { width: 3, borderRadius: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 },
  name: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 14 },
  deadName: { color: Colors.textMuted },
  activeBadge: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_600SemiBold', fontSize: 9, letterSpacing: 1 },
  deadBadge: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 9, letterSpacing: 1 },
  humanBadge: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 1 },
  capitalRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  capitalText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 11 },
  statsRow: { flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'center' },
  statValue: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 15 },
  statLabel: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 1 },
  continentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  continentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  continentText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_500Medium', fontSize: 10 },
  pactRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pactText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_500Medium', fontSize: 11 },
  iComRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  iComBtn: {
    minHeight: 44, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: MapHud.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  iComBtnDanger: { borderColor: 'rgba(186,38,43,0.5)', backgroundColor: 'rgba(117,21,27,0.14)' },
  iComBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 10 },
  iComBtnTextDanger: { color: Colors.textCrimson },
  controlPressed: { opacity: 0.72 },
});
