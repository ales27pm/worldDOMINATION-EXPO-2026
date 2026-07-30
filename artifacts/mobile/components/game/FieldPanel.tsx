import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GradientFill } from '@/components/GradientFill';
import { Colors } from '@/constants/colors';
import { MapHud } from '@/constants/mapHud';
import { Fonts } from '@/constants/typography';

/**
 * Imperial field furniture — the mobile mirror of the web's FieldPanel.tsx:
 * a parchment sheet with a double ink border and four brass corner tacks,
 * plus the ImperialDivider and roman-numeral SectionHeader.
 */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function ImperialDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <GradientFill
      horizontal
      colors={['transparent', Colors.goldDim, Colors.goldMid, Colors.goldDim, 'transparent']}
      locations={[0, 0.2, 0.5, 0.8, 1]}
      style={[styles.divider, style]}
    />
  );
}

export function SectionHeader({ index, title }: { index: number; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionNumeral}>{ROMAN[index - 1] ?? index}.</Text>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <ImperialDivider style={{ flex: 1 }} />
    </View>
  );
}

function Tack({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return <View style={[styles.tack, tackPos[corner]]} />;
}

const tackPos: Record<'tl' | 'tr' | 'bl' | 'br', ViewStyle> = {
  tl: { top: 4, left: 4 },
  tr: { top: 4, right: 4 },
  bl: { bottom: 4, left: 4 },
  br: { bottom: 4, right: 4 },
};

export function FieldPanel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View testID="map-election-panel" style={[styles.outer, style]}>
      <View style={styles.inner}>{children}</View>
      <Tack corner="tl" />
      <Tack corner="tr" />
      <Tack corner="bl" />
      <Tack corner="br" />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: MapHud.parchment,
    borderWidth: 1.5,
    borderColor: Colors.parchmentBorder,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inner: {
    borderWidth: 1,
    borderColor: 'rgba(107,74,38,0.55)',
    padding: 12,
  },
  tack: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.goldBright,
    borderWidth: 0.5,
    borderColor: '#3a2812',
  },
  divider: { height: 1, alignSelf: 'stretch' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionNumeral: {
    color: Colors.goldBright,
    fontFamily: Fonts.display,
    fontSize: 13,
  },
  sectionTitle: {
    color: Colors.ink,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 3,
  },
});
