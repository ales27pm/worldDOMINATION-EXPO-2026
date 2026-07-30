import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { Fonts } from '@/constants/typography';
import { toggleSfxMuted, useSfxMuted } from '@/lib/sfx';
import { missionText } from '@/game/missions';
import { OBJECTIVE_INFO } from '@/game/types';
import type { GameState } from '@/game/types';

/**
 * The imperial command bar — mobile mirror of the web's TopBar.tsx: player
 * dot with an inset shine, name + turn/objective line, the three phase pips
 * (I. DEP / II. ENG / III. MAN), mute toggle and Hall (exit) button.
 */

const PHASE_PIPS: { key: string; label: string; phases: string[] }[] = [
  { key: 'dep', label: 'I. DEP', phases: ['reinforcement'] },
  { key: 'eng', label: 'II. ENG', phases: ['attack'] },
  { key: 'man', label: 'III. MAN', phases: ['fortify'] },
];

const SETUP_PHASES: Record<string, string> = {
  territoryGrab: 'CLAIMING',
  election: 'ELECTION',
  initialDeploy: 'DEPLOYING',
  chooseCapital: 'CAPITAL',
};

export function TopBar({ game, onExit }: { game: GameState; onExit: () => void }) {
  const sfxMuted = useSfxMuted();
  const player = game.players[game.currentPlayer];
  if (!player) return null;

  const setupChip = SETUP_PHASES[game.phase];
  const objective = OBJECTIVE_INFO[game.setup.objective]?.name ?? 'Campaign';
  const mission =
    game.setup.objective === 'mission' && player.isHuman && player.mission
      ? missionText(player.mission, game.players)
      : null;

  return (
    <View testID="map-top-bar" style={styles.bar}>
      <View style={styles.row}>
        <Pressable onPress={onExit} style={styles.hallBtn} accessibilityLabel="Exit to hall">
          <Text style={styles.hallText}>⌂ Hall</Text>
        </Pressable>

        {/* Player dot with inset shine */}
        <View style={[styles.dot, { backgroundColor: player.color }]}>
          <View style={styles.dotShine} />
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {player.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            Turn {game.turn} — {objective}
          </Text>
        </View>

        {/* Phase pips */}
        <View style={styles.pips}>
          {setupChip ? (
            <View style={[styles.pip, styles.pipActive]}>
              <Text style={[styles.pipText, styles.pipTextActive]}>{setupChip}</Text>
            </View>
          ) : (
            PHASE_PIPS.map((pip) => {
              const active = pip.phases.includes(game.phase);
              return (
                <View key={pip.key} style={[styles.pip, active && styles.pipActive]}>
                  <Text style={[styles.pipText, active && styles.pipTextActive]}>{pip.label}</Text>
                </View>
              );
            })
          )}
        </View>

        <Pressable onPress={toggleSfxMuted} style={styles.muteBtn} accessibilityLabel="Toggle sound">
          <Text style={[styles.muteText, sfxMuted && { opacity: 0.5 }]}>{sfxMuted ? '♪̸' : '♪'}</Text>
        </Pressable>
      </View>

      {mission && (
        <Text style={styles.mission} numberOfLines={1}>
          Secret mission: {mission}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: MapHud.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(222,190,115,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hallBtn: {
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.4)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  hallText: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a2812',
    overflow: 'hidden',
  },
  dotShine: {
    position: 'absolute',
    top: 1.5,
    left: 3,
    width: 6,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  nameBlock: { flex: 1, minWidth: 0 },
  name: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.text,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    lineHeight: 17,
  },
  meta: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyItalic,
    fontSize: 10.5,
    lineHeight: 13,
  },
  pips: { flexDirection: 'row', gap: 4 },
  pip: {
    borderWidth: 1,
    borderColor: 'rgba(155,118,70,0.5)',
    paddingHorizontal: 5,
    paddingVertical: 2.5,
  },
  pipActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(222,190,115,0.14)',
  },
  pipText: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 8.5,
    letterSpacing: 1.5,
  },
  pipTextActive: { color: Colors.gold },
  muteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontSize: 14 },
  mission: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: Fonts.bodyItalic,
    fontSize: 10.5,
    marginTop: 3,
    opacity: 0.9,
  },
});
