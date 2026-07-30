import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { Fonts } from '@/constants/typography';
import type { GamePhase, GameState } from '@/game/types';

/**
 * Non-blocking chapter card announcing each phase of the player's turn —
 * RISK II's "I. Deployment / II. Engagement / III. Maneuver" title cards,
 * shrunk to a toast that never eats a tap.
 */

const BANNERS: Partial<Record<GamePhase, { title: string; sub: (game: GameState) => string }>> = {
  reinforcement: {
    title: 'I. DEPLOYMENT',
    sub: (g) =>
      `Muster ${g.reinforcementsRemaining} ${g.reinforcementsRemaining === 1 ? 'battalion' : 'battalions'} — tap your territories`,
  },
  attack: {
    title: 'II. ENGAGEMENT',
    sub: () => 'Select a stronghold, then strike a neighbour',
  },
  fortify: {
    title: 'III. MANEUVER',
    sub: () => 'One tactical march, then end the turn',
  },
};

const SHOW_MS = 1700;

export function PhaseBanner({ game }: { game: GameState }) {
  const [content, setContent] = useState<{ title: string; sub: string } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const player = game.players[game.currentPlayer];
    const def = BANNERS[game.phase];
    if (!player?.isHuman || game.awaitingHandoff || !def) return;
    const key = `${game.turn}:${game.currentPlayer}:${game.phase}`;
    if (shownKeyRef.current === key) return;
    shownKeyRef.current = key;

    setContent({ title: def.title, sub: def.sub(game) });
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 340, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setContent(null);
        },
      );
    }, SHOW_MS);
  }, [game, anim]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!content) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        testID="map-phase-banner"
        style={[
          styles.banner,
          {
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
            ],
          },
        ]}
      >
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.sub}>{content.sub}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '13%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9,
  },
  banner: {
    backgroundColor: MapHud.control,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    maxWidth: '86%',
  },
  title: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: Fonts.display,
    fontSize: 17,
    letterSpacing: 3,
  },
  sub: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyItalic,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
