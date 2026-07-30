import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { CARD_TYPE_LABEL, findBestSet, isValidSet } from '@/game/cards';
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

  const handleTrade = () => {
    if (!canTrade) return;
    dispatch({ type: 'TRADE_CARDS', cardIds: Array.from(selected) });
    setSelected(new Set());
  };

  const handleAutoTrade = () => {
    const best = findBestSet(player.cards, cardRule);
    if (best) {
      dispatch({ type: 'AUTO_TRADE' });
      setSelected(new Set());
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView testID="map-card-hand" style={styles.sheet} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>RISK CARDS</Text>
            <View style={styles.headerRight}>
              {game.mustTrade && <Text style={styles.mustTrade}>Must trade (5+ cards)</Text>}
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.hint}>
            Select 3 cards of the same type, or one of each type to trade.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cards}
            contentContainerStyle={styles.cardsContent}>
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

          <View style={styles.actions}>
            {findBestSet(player.cards, cardRule) && (
              <Pressable onPress={handleAutoTrade} style={styles.autoBtn}>
                <Text style={styles.autoBtnText}>Auto-Trade Best Set</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleTrade}
              disabled={!canTrade}
              style={[styles.tradeBtn, !canTrade && styles.tradeBtnDisabled]}
            >
              <Text style={[styles.tradeBtnText, !canTrade && styles.tradeBtnTextDisabled]}>
                Trade Selected ({selectedCards.length}/3)
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function CardTile({ card, selected, onPress, ownedTerritory }: {
  card: RiskCard;
  selected: boolean;
  onPress: () => void;
  ownedTerritory: boolean;
}) {
  const bgColor = CARD_COLORS[card.type] ?? '#444';
  return (
    <Pressable onPress={onPress} style={[styles.card, selected && styles.cardSelected]}>
      <View style={[styles.cardInner, { borderColor: bgColor }]}>
        <View style={[styles.cardType, { backgroundColor: bgColor }]}>
          <Text style={styles.cardTypeText}>{CARD_TYPE_LABEL[card.type]}</Text>
        </View>
        {card.territory && (
          <Text style={styles.cardTerritory} numberOfLines={2}>{card.territory}</Text>
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
  backdrop: { flex: 1, backgroundColor: MapHud.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: MapHud.modal, borderTopWidth: 1, borderTopColor: Colors.border, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 14, letterSpacing: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mustTrade: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textCrimson, fontFamily: 'Alegreya_600SemiBold', fontSize: 12 },
  closeBtn: { padding: 4 },
  closeText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontSize: 18 },
  hint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  cards: { maxHeight: 160 },
  cardsContent: { gap: 8, paddingHorizontal: 4 },
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
  actions: { flexDirection: 'row', gap: 10 },
  autoBtn: {
    flex: 1, backgroundColor: MapHud.control, borderWidth: 1, borderColor: Colors.gold,
    paddingVertical: 12, alignItems: 'center',
  },
  autoBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_600SemiBold', fontSize: 13 },
  tradeBtn: { flex: 1, backgroundColor: Colors.gold, paddingVertical: 12, alignItems: 'center' },
  tradeBtnDisabled: { backgroundColor: MapHud.control },
  tradeBtnText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 13 },
  tradeBtnTextDisabled: { color: Colors.disabledText },
});
