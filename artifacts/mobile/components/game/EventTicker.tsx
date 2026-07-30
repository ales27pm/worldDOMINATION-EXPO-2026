import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { Fonts } from '@/constants/typography';
import { campaignEventFeedSnapshot, shouldHighlightNewestEvent } from '@/game/eventFeed';
import type { GameState } from '@/game/types';

/** Dispatch-line colours per log tone — matches the DispatchLog modal. */
const TONE_COLORS: Record<string, string> = {
  info: 'rgba(236, 222, 189, 0.92)',
  gold: '#e7c268',
  crimson: '#e06a52',
  battle: '#e0a050',
};

/**
 * RISK II-style event ticker — the last few war dispatches in a translucent
 * olive band above the command panel, so the story of the war stays readable
 * without hiding the map. Newest line at the bottom, like the original's
 * scrolling readout.
 */
export function EventTicker({ game, lines = 3 }: { game: GameState; lines?: number }) {
  const snapshot = useMemo(() => campaignEventFeedSnapshot(game.log, lines), [game.log, lines]);
  const previousNewestRef = useRef<number | null>(null);
  const highlightNewest = shouldHighlightNewestEvent(snapshot, previousNewestRef.current);

  useEffect(() => {
    previousNewestRef.current = snapshot.newestEventId;
  }, [snapshot.newestEventId]);

  if (snapshot.showsEmptyState) return null;
  return (
    <View testID="map-event-ticker" style={styles.band} pointerEvents="none">
      {snapshot.displayEvents.map((entry) => (
        <Text
          key={entry.id}
          numberOfLines={1}
          style={[
            styles.line,
            entry.id === snapshot.newestEventId && highlightNewest && styles.lineNewest,
            { color: TONE_COLORS[entry.tone] ?? TONE_COLORS.info },
          ]}
        >
          {entry.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: MapHud.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(222, 190, 115, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  line: {
    ...MAP_HUD_TEXT_SHADOW,
    fontFamily: Fonts.body,
    fontSize: 10,
    lineHeight: 14,
  },
  lineNewest: {
    textShadowColor: 'rgba(231,194,104,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
