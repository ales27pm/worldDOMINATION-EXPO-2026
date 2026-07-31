import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { CARD_TYPE_LABEL, findBestSet, isValidSet } from '@/game/cards';
import { resolveCardHandLayout } from '@/game/overlayLayout';
import { TERRITORY_MAP } from '@/game/mapData';
import type { GameAction, GameState, RiskCard } from '@/game/types';

interface Props {
  game: GameState;
  dispatch: (action: GameAction) => void;
  open: boolean;
  onClose: () => void;
}

const CARD_COLORS: Record<string, string> = {
  infantry: '#3a6a3a',
  cavalry: '#3a5a8a',
  artillery: '#8a4a2a',
  wild: '#6a4a8a',
};

export default function CardHand({ game, dispatch, open, onClose }: Props) {
  const player = game.players[game.currentPlayer];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const cardRule = game.setup.cardRule ?? 'ascending';
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(
    () => resolveCardHandLayout({ width, height, insets }),
    [height, insets, width],
  );

  if (!player) return null;

  const toggleCard = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < 3) {
      next.add(id);
    }
    setSelected(next);
  };

  const selectedCards = player.cards.filter((c) => selected.has(c.id));
  const canTrade = selectedCards.length === 3 && isValidSet(selectedCards);
  const bestSet = findBestSet(player.cards, cardRule);
  const cardRuleLabel = cardRule === 'ascending'
    ? 'Ascending schedule'
    : cardRule === 'ascendingByOne'
      ? 'Ascending +1 schedule'
      : 'Fixed-value sets';
  const selectedSummary =
    selectedCards.length === 0
      ? 'No cards selected'
      : `${selectedCards.length}/3 selected`;

  const handleTrade = () => {
    if (!canTrade) return;
    dispatch({ type: 'TRADE_CARDS', cardIds: Array.from(selected) });
    setSelected(new Set());
  };

  const handleAutoTrade = () => {
    if (bestSet) {
      dispatch({ type: 'AUTO_TRADE' });
      setSelected(new Set());
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          layout.placement === 'right' ? styles.backdropRight : styles.backdropBottom,
        ]}
      >
        <View
          testID="map-card-hand"
          style={[
            styles.sheet,
            layout.placement === 'right' ? styles.sheetRight : styles.sheetBottom,
            layout.borderEdge === 'left' ? styles.sheetBorderLeft : styles.sheetBorderTop,
            {
              width: layout.width,
              maxHeight: layout.maxHeight,
              paddingTop: layout.paddingTop,
              paddingRight: layout.paddingRight,
              paddingBottom: layout.paddingBottom,
              paddingLeft: layout.paddingLeft,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.title}>RISK CARDS</Text>
            <View style={styles.headerRight}>
              {game.mustTrade && <Text style={styles.mustTrade}>Must trade (5+ cards)</Text>}
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close card hand"
              >
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.statusRow}>
            <StatusChip label="Rule" value={cardRuleLabel} />
            <StatusChip
              label="Selection"
              value={canTrade ? 'Valid set' : selectedSummary}
              danger={game.mustTrade && !canTrade}
            />
            <StatusChip
              label="Auto"
              value={bestSet ? 'Set ready' : 'No set'}
              muted={!bestSet}
            />
          </View>

          <Text style={styles.hint}>
            Select three matching cards, or one infantry, cavalry and artillery. Owned territory cards add a +2 reserve.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.cards, { maxHeight: layout.cardRailHeight }]}
            contentContainerStyle={styles.cardsContent}
          >
            {player.cards.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                selected={selected.has(card.id)}
                onPress={() => toggleCard(card.id)}
                ownedTerritory={card.territory !== null && game.territories[card.territory]?.owner === player.id}
              />
            ))}
          </ScrollView>

          {player.cards.length === 0 && (
            <Text style={styles.empty}>No cards in hand</Text>
          )}

          <View style={[styles.actions, { flexDirection: layout.actionsDirection }]}>
            {bestSet && (
              <Pressable
                onPress={handleAutoTrade}
                style={styles.autoBtn}
                accessibilityRole="button"
                accessibilityLabel="Automatically trade the best available set"
              >
                <Text style={styles.autoBtnText}>Auto-Trade Best Set</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleTrade}
              disabled={!canTrade}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canTrade }}
              style={[styles.tradeBtn, !canTrade && styles.tradeBtnDisabled]}
            >
              <Text style={[styles.tradeBtnText, !canTrade && styles.tradeBtnTextDisabled]}>
                Trade Selected ({selectedCards.length}/3)
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatusChip({ label, value, danger, muted }: {
  label: string;
  value: string;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={[styles.statusChip, danger && styles.statusChipDanger, muted && styles.statusChipMuted]}>
      <Text style={styles.statusChipLabel}>{label}</Text>
      <Text style={[styles.statusChipValue, danger && styles.statusChipValueDanger, muted && styles.statusChipValueMuted]}>
        {value}
      </Text>
    </View>
  );
}

function CardTile({ card, selected, onPress, ownedTerritory }: {
  card: RiskCard;
  selected: boolean;
  onPress: () => void;
  ownedTerritory: boolean;
}) {
  const bgColor = CARD_COLORS[card.type] ?? '#444';
  const territoryName = card.territory ? TERRITORY_MAP[card.territory]?.name ?? card.territory : null;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${CARD_TYPE_LABEL[card.type]} card${territoryName ? `, ${territoryName}` : ''}${ownedTerritory ? ', owned territory bonus' : ''}`}
    >
      <View style={[styles.cardInner, { borderColor: bgColor }]}>
        <View style={[styles.cardType, { backgroundColor: bgColor }]}>
          <Text style={styles.cardTypeText}>{CARD_TYPE_LABEL[card.type]}</Text>
        </View>
        {territoryName && (
          <Text style={styles.cardTerritory} numberOfLines={2}>{territoryName}</Text>
        )}
        {ownedTerritory && (
          <View style={styles.bonusDot}>
            <Text style={styles.bonusDotText}>+2</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: MapHud.scrim },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropRight: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  sheet: { backgroundColor: MapHud.modal, gap: 12 },
  sheetBottom: { alignSelf: 'stretch' },
  sheetRight: { flex: 1 },
  sheetBorderTop: { borderTopWidth: 1, borderTopColor: Colors.borderGold },
  sheetBorderLeft: { borderLeftWidth: 1, borderLeftColor: Colors.borderGold },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 14, letterSpacing: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  mustTrade: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textCrimson, fontFamily: 'Alegreya_600SemiBold', fontSize: 12 },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: MapHud.control,
  },
  closeText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontSize: 18 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    flexGrow: 1,
    minWidth: 108,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: MapHud.control,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusChipDanger: { borderColor: Colors.crimson, backgroundColor: 'rgba(117,21,27,0.24)' },
  statusChipMuted: { opacity: 0.72 },
  statusChipLabel: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: 'Alegreya_400Regular',
    fontSize: 10,
  },
  statusChipValue: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: 'Alegreya_700Bold',
    fontSize: 12,
  },
  statusChipValueDanger: { color: Colors.textCrimson },
  statusChipValueMuted: { color: Colors.textMuted },
  hint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  cards: { maxHeight: 160 },
  cardsContent: { gap: 8, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 10 },
  card: { opacity: 1 },
  cardSelected: { transform: [{ translateY: -8 }] },
  cardInner: {
    width: 90, height: 130, borderWidth: 2,
    backgroundColor: MapHud.modal, alignItems: 'center', overflow: 'hidden',
  },
  cardType: { width: '100%', paddingVertical: 6, alignItems: 'center' },
  cardTypeText: { color: '#fff', fontFamily: 'Alegreya_700Bold', fontSize: 11, letterSpacing: 1 },
  cardTerritory: {
    ...MAP_HUD_TEXT_SHADOW,
    flex: 1, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 10,
    textAlign: 'center', padding: 8, paddingTop: 12,
  },
  bonusDot: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2,
  },
  bonusDotText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 9 },
  empty: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 14, textAlign: 'center', padding: 20 },
  actions: { gap: 10 },
  autoBtn: {
    flex: 1, backgroundColor: MapHud.control, borderWidth: 1, borderColor: Colors.gold,
    minHeight: 46, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  autoBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_600SemiBold', fontSize: 13 },
  tradeBtn: {
    flex: 1,
    minHeight: 46,
    backgroundColor: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeBtnDisabled: { backgroundColor: MapHud.control },
  tradeBtnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 13 },
  tradeBtnTextDisabled: { color: Colors.disabledText },
});
