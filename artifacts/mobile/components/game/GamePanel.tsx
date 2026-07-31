import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW, MapHud } from '@/constants/mapHud';
import { allianceBetween } from '@/game/analysis';
import {
  buildCommandStatus,
  type CommandStatus,
  type CommandTone,
} from '@/game/commandStatus';
import { TERRITORY_MAP } from '@/game/mapData';
import { ALLIANCE_LEVEL_INFO } from '@/game/types';
import type { GameAction, GameState, TerritoryId } from '@/game/types';

/** A fortify move staged on the map, awaiting the MARCH confirmation. */
export interface StagedMove {
  from: TerritoryId;
  to: TerritoryId;
  count: number;
}

interface Props {
  game: GameState;
  selected: TerritoryId | null;
  targets: Set<TerritoryId>;
  stagedMove: StagedMove | null;
  setStagedMove: (m: StagedMove | null) => void;
  diceCount: number;
  setDiceCount: (v: number) => void;
  dispatch: (a: GameAction) => void;
  onOpenCards: () => void;
  onOpenRoster: () => void;
  onOpenLog: () => void;
  canAct?: boolean;
  inactiveHint?: string;
}

export default function GamePanel({
  game, selected, targets, stagedMove, setStagedMove,
  diceCount, setDiceCount, dispatch, onOpenCards, onOpenRoster, onOpenLog,
  canAct = true, inactiveHint,
}: Props) {
  const player = game.players[game.currentPlayer];
  const phase = game.phase;

  if (!player) return null;

  const selectedTerritory = selected ? game.territories[selected] : null;
  const selectedOwned = selectedTerritory?.owner === player.id;
  const commandStatus = buildCommandStatus({
    game,
    playerId: player.id,
    selected,
    targetsCount: targets.size,
    stagedMove,
    diceCount,
  });

  const renderPhaseHint = () => {
    switch (phase) {
      case 'territoryGrab': return 'Tap an unclaimed territory to claim it.';
      case 'election': return 'Participate in the territory auction.';
      case 'initialDeploy': return 'Tap your territory to deploy starting armies.';
      case 'chooseCapital': return 'Tap your territory to establish your capital city.';
      case 'reinforcement':
        if (game.mustTrade) return '⚠ You must trade cards before deploying.';
        if (game.awaitingHandoff) return 'Waiting for handoff confirmation.';
        return `Deploy ${game.reinforcementsRemaining} armies — every tap on your territory places one.`;
      case 'attack': return 'Select your territory, then tap an enemy to attack.';
      case 'fortify':
        if (game.fortifyUsed) return 'Tactical move complete — end the turn.';
        return 'One tactical move: select a territory, then tap a neighbour.';
      case 'sameTimeReinforce': {
        if (player.cards.length >= 5) return '⚠ You must trade cards before deploying.';
        const remaining = game.sameTime?.reinforcementsRemaining[player.id] ?? 0;
        if (remaining > 0) return `Deploy ${remaining} armies in secret — tap your territory to place.`;
        return 'All reinforcements placed — seal your orders.';
      }
      case 'sameTimeBattle':
        return 'Stage attack orders in secret. Every commander\'s orders resolve together once all are sealed.';
      case 'sameTimeMove':
        return 'Reposition armies through your own territory. Everyone moves at once once all confirm.';
      default: return '';
    }
  };

  const renderActions = () => {
    if (!canAct) {
      return inactiveHint ? <Text style={styles.hint}>{inactiveHint}</Text> : null;
    }
    if (game.awaitingHandoff || !player.isHuman) return null;

    if (phase === 'territoryGrab') {
      if (!selected) return null;
      const ter = game.territories[selected];
      if (ter.owner !== -1) return (
        <Text style={styles.hint}>Territory already claimed.</Text>
      );
      return (
        <ActionBtn label={`Claim ${TERRITORY_MAP[selected]?.name ?? selected}`} gold onPress={() => dispatch({ type: 'CLAIM_TERRITORY', territory: selected })} />
      );
    }

    if (phase === 'chooseCapital') {
      if (!selected || !selectedOwned) return null;
      if (player.capital) return <Text style={styles.hint}>Capital already chosen.</Text>;
      return (
        <ActionBtn label={`Set Capital: ${TERRITORY_MAP[selected]?.name ?? selected}`} gold onPress={() => dispatch({ type: 'CHOOSE_CAPITAL', territory: selected })} />
      );
    }

    if (phase === 'initialDeploy') {
      if (!selected || !selectedOwned) return null;
      const remaining = game.initialRemaining[player.id] ?? 0;
      if (remaining === 0) return <Text style={styles.hint}>All armies placed. Awaiting others.</Text>;
      return (
        <ActionBtn label={`Place armies here (${remaining} left)`} gold onPress={() => dispatch({ type: 'PLACE_INITIAL', territory: selected })} />
      );
    }

    if (phase === 'reinforcement') {
      const remaining = game.reinforcementsRemaining;
      const canUndo = (game.deployLog?.length ?? 0) > 0;
      return (
        <View style={styles.actionGroup}>
          {game.mustTrade ? (
            <ActionBtn label="Open Cards (must trade)" gold onPress={onOpenCards} />
          ) : (
            <>
              {selected && selectedOwned && remaining > 1 && (
                <ActionBtn
                  label={`Place all here (${remaining})`}
                  gold
                  onPress={() => dispatch({ type: 'DEPLOY', territory: selected, count: remaining })}
                />
              )}
              {(canUndo || player.cards.length > 0) && (
                <View style={styles.deployRow}>
                  {canUndo && (
                    <ActionBtn label="↶ Undo" flex onPress={() => dispatch({ type: 'UNDO_DEPLOY' })} />
                  )}
                  {player.cards.length > 0 && (
                    <ActionBtn label={`Cards (${player.cards.length})`} flex onPress={onOpenCards} />
                  )}
                </View>
              )}
            </>
          )}
        </View>
      );
    }

    if (phase === 'attack') {
      const maxDice = selectedTerritory ? Math.max(1, Math.min(3, selectedTerritory.armies - 1)) : 3;
      return (
        <View style={styles.actionGroup}>
          {selected && selectedOwned && targets.size > 0 && (
            <View style={styles.diceRow}>
              <Text style={styles.diceLabel}>Dice:</Text>
              {[1, 2, 3].map((n) => {
                const disabled = n > maxDice;
                const active = diceCount === n && !disabled;
                return (
                  <Pressable
                    key={n}
                    disabled={disabled}
                    onPress={() => setDiceCount(n)}
                    style={[styles.diceBtn, active && styles.diceBtnActive, disabled && styles.diceBtnDisabled]}
                  >
                    <Text style={[styles.diceBtnText, active && styles.diceBtnTextActive, disabled && styles.diceBtnTextDisabled]}>
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {selected && selectedOwned && targets.size > 0 && (
            <Text style={styles.attackHint}>Tap a red territory to attack</Text>
          )}
          <ActionBtn label="End Attack →" onPress={() => dispatch({ type: 'END_ATTACK' })} />
        </View>
      );
    }

    if (phase === 'fortify') {
      if (game.fortifyUsed) {
        return (
          <View style={styles.actionGroup}>
            <Text style={styles.hint}>Tactical move complete.</Text>
            <ActionBtn label="End Turn →" gold onPress={() => dispatch({ type: 'END_TURN' })} />
          </View>
        );
      }
      if (stagedMove) {
        const fromTer = game.territories[stagedMove.from];
        const maxMove = Math.max(1, (fromTer?.armies ?? 2) - 1);
        const count = Math.min(stagedMove.count, maxMove);
        const fromName = TERRITORY_MAP[stagedMove.from]?.name ?? stagedMove.from;
        const toName = TERRITORY_MAP[stagedMove.to]?.name ?? stagedMove.to;
        return (
          <View style={styles.actionGroup}>
            <Text style={styles.stagedLabel} numberOfLines={1}>
              March: {fromName} → {toName}
            </Text>
            <View style={styles.deployRow}>
              <Stepper
                value={count}
                min={1}
                max={maxMove}
                onChange={(n) => setStagedMove({ ...stagedMove, count: n })}
              />
              <ActionBtn
                label={`March ${count} →`}
                gold
                flex
                onPress={() => {
                  dispatch({ type: 'FORTIFY', from: stagedMove.from, to: stagedMove.to, count });
                  setStagedMove(null);
                }}
              />
            </View>
            <ActionBtn label="Cancel" onPress={() => setStagedMove(null)} />
          </View>
        );
      }
      return (
        <View style={styles.actionGroup}>
          {selected && selectedOwned && targets.size > 0 && (
            <Text style={styles.attackHint}>Tap a green territory to stage the march</Text>
          )}
          <ActionBtn label="End Turn →" gold onPress={() => dispatch({ type: 'END_TURN' })} />
        </View>
      );
    }

    if (phase === 'sameTimeReinforce') {
      const st = game.sameTime;
      const remaining = st?.reinforcementsRemaining[player.id] ?? 0;
      const mustTrade = player.cards.length >= 5;
      const canUndo = (st?.deployLog[player.id]?.length ?? 0) > 0;
      return (
        <View style={styles.actionGroup}>
          {mustTrade ? (
            <ActionBtn label="Open Cards (must trade)" gold onPress={onOpenCards} />
          ) : (
            <>
              {selected && selectedOwned && remaining > 1 && (
                <ActionBtn
                  label={`Place all here (${remaining})`}
                  gold
                  onPress={() => dispatch({ type: 'DEPLOY', territory: selected, count: remaining })}
                />
              )}
              {(canUndo || player.cards.length > 0) && (
                <View style={styles.deployRow}>
                  {canUndo && <ActionBtn label="↶ Undo" flex onPress={() => dispatch({ type: 'UNDO_DEPLOY' })} />}
                  {player.cards.length > 0 && (
                    <ActionBtn label={`Cards (${player.cards.length})`} flex onPress={onOpenCards} />
                  )}
                </View>
              )}
            </>
          )}
          <ActionBtn
            label="Seal Reinforcements →"
            gold
            disabled={mustTrade || remaining > 0}
            onPress={() => dispatch({ type: 'ST_READY_REINFORCE' })}
          />
        </View>
      );
    }

    if (phase === 'sameTimeBattle') {
      const myOrders = game.sameTime?.orders.filter((o) => o.player === player.id) ?? [];
      if (stagedMove) {
        const fromTer = game.territories[stagedMove.from];
        const committed = myOrders
          .filter((o) => o.from === stagedMove.from)
          .reduce((sum, o) => sum + o.count, 0);
        const maxCount = Math.max(1, (fromTer?.armies ?? 2) - 1 - committed);
        const count = Math.min(stagedMove.count, maxCount);
        const fromName = TERRITORY_MAP[stagedMove.from]?.name ?? stagedMove.from;
        const toName = TERRITORY_MAP[stagedMove.to]?.name ?? stagedMove.to;
        return (
          <View style={styles.actionGroup}>
            <Text style={styles.stagedLabel} numberOfLines={1}>Attack order: {fromName} → {toName}</Text>
            <View style={styles.deployRow}>
              <Stepper value={count} min={1} max={maxCount} onChange={(n) => setStagedMove({ ...stagedMove, count: n })} />
              <ActionBtn
                label={`Queue ${count} →`}
                gold
                flex
                onPress={() => {
                  dispatch({ type: 'ST_QUEUE_ATTACK', from: stagedMove.from, to: stagedMove.to, count, surgeTo: null });
                  setStagedMove(null);
                }}
              />
            </View>
            <ActionBtn label="Cancel" onPress={() => setStagedMove(null)} />
          </View>
        );
      }
      return (
        <View style={styles.actionGroup}>
          {selected && selectedOwned && targets.size > 0 && (
            <Text style={styles.attackHint}>Tap a red territory to stage an attack order</Text>
          )}
          {myOrders.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ordersList}>
              {myOrders.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => dispatch({ type: 'ST_CANCEL_ATTACK', orderId: o.id })}
                  style={styles.orderChip}
                >
                  <Text style={styles.orderChipText}>
                    {o.count} · {TERRITORY_MAP[o.from]?.name ?? o.from} → {TERRITORY_MAP[o.to]?.name ?? o.to} ✕
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <ActionBtn label="Seal Attack Orders →" gold onPress={() => dispatch({ type: 'ST_READY_BATTLE' })} />
        </View>
      );
    }

    if (phase === 'sameTimeMove') {
      const myMoves = game.sameTime?.moves.filter((m) => m.player === player.id) ?? [];
      if (stagedMove) {
        const fromTer = game.territories[stagedMove.from];
        const committed = myMoves
          .filter((m) => m.from === stagedMove.from)
          .reduce((sum, m) => sum + m.count, 0);
        const maxCount = Math.max(1, (fromTer?.armies ?? 2) - 1 - committed);
        const count = Math.min(stagedMove.count, maxCount);
        const fromName = TERRITORY_MAP[stagedMove.from]?.name ?? stagedMove.from;
        const toName = TERRITORY_MAP[stagedMove.to]?.name ?? stagedMove.to;
        return (
          <View style={styles.actionGroup}>
            <Text style={styles.stagedLabel} numberOfLines={1}>March order: {fromName} → {toName}</Text>
            <View style={styles.deployRow}>
              <Stepper value={count} min={1} max={maxCount} onChange={(n) => setStagedMove({ ...stagedMove, count: n })} />
              <ActionBtn
                label={`Queue ${count} →`}
                gold
                flex
                onPress={() => {
                  dispatch({ type: 'ST_QUEUE_MOVE', from: stagedMove.from, to: stagedMove.to, count });
                  setStagedMove(null);
                }}
              />
            </View>
            <ActionBtn label="Cancel" onPress={() => setStagedMove(null)} />
          </View>
        );
      }
      return (
        <View style={styles.actionGroup}>
          {selected && selectedOwned && targets.size > 0 && (
            <Text style={styles.attackHint}>Tap a highlighted territory to stage a march</Text>
          )}
          {myMoves.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ordersList}>
              {myMoves.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => dispatch({ type: 'ST_CANCEL_MOVE', orderId: m.id })}
                  style={styles.orderChip}
                >
                  <Text style={styles.orderChipText}>
                    {m.count} · {TERRITORY_MAP[m.from]?.name ?? m.from} → {TERRITORY_MAP[m.to]?.name ?? m.to} ✕
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <ActionBtn label="Confirm Movement →" gold onPress={() => dispatch({ type: 'ST_READY_MOVE' })} />
        </View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      {/* Current player + status */}
      <View style={styles.statusRow}>
        <View style={[styles.playerDot, { backgroundColor: player.color }]} />
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.phase}>{phaseLabel(phase)}</Text>
        {phase === 'reinforcement' && game.reinforcementsRemaining > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{game.reinforcementsRemaining}</Text>
          </View>
        )}
        {phase === 'sameTimeReinforce' && (game.sameTime?.reinforcementsRemaining[player.id] ?? 0) > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{game.sameTime?.reinforcementsRemaining[player.id]}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onOpenRoster}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open commander roster"
        >
          <Ionicons name="people-outline" size={20} color={Colors.gold} />
        </Pressable>
        <Pressable
          onPress={onOpenLog}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open field dispatch"
        >
          <Ionicons name="newspaper-outline" size={20} color={Colors.gold} />
        </Pressable>
      </View>

      {/* Selected territory info */}
      {selected && (
        <View style={styles.selectedRow}>
          <Text style={styles.selectedName}>{TERRITORY_MAP[selected]?.name ?? selected}</Text>
          <Text style={styles.selectedArmies}>{selectedTerritory?.armies ?? 0} armies</Text>
          {selectedTerritory && selectedTerritory.owner >= 0 && (
            <View style={[styles.ownerDot, { backgroundColor: game.players[selectedTerritory.owner]?.color ?? '#888' }]} />
          )}
          {selected && selectedOwned && (
            <Text style={styles.ownerSelf}>YOURS</Text>
          )}
          {/* Alliance info */}
          {selected && !selectedOwned && selectedTerritory && selectedTerritory.owner >= 0 && (() => {
            const alliance = allianceBetween(game, player.id, selectedTerritory.owner);
            if (!alliance) return null;
            return (
              <Text style={styles.allianceBadge}>{ALLIANCE_LEVEL_INFO[alliance.level].name}</Text>
            );
          })()}
        </View>
      )}

      {/* Hint text */}
      {!selected && (
        <Text style={styles.phaseHint}>{renderPhaseHint()}</Text>
      )}

      <CommandStatusBar status={commandStatus} />

      {/* Action area */}
      <View style={styles.actions}>
        {renderActions()}
      </View>
    </View>
  );
}

function CommandStatusBar({ status }: { status: CommandStatus | null }) {
  if (!status) return null;
  return (
    <View
      style={[styles.commandStatus, toneStyle(status.tone, 'status')]}
      accessibilityRole="summary"
      accessibilityLabel={`${status.headline}. ${status.chips
        .map((chip) => `${chip.label} ${chip.value}`)
        .join(', ')}`}
    >
      <Text style={[styles.commandStatusHeadline, toneStyle(status.tone, 'text')]} numberOfLines={2}>
        {status.headline}
      </Text>
      <View style={styles.commandChips}>
        {status.chips.map((chip) => (
          <View
            key={`${chip.label}-${chip.value}`}
            style={[styles.commandChip, toneStyle(chip.tone ?? status.tone, 'chip')]}
          >
            <Text style={styles.commandChipLabel}>{chip.label}</Text>
            <Text style={[styles.commandChipValue, toneStyle(chip.tone ?? status.tone, 'text')]}>
              {chip.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function toneStyle(
  tone: CommandTone,
  slot: 'chip' | 'status' | 'text',
) {
  const palette: Record<CommandTone, { border: string; background: string; color: string }> = {
    active: {
      border: 'rgba(222,190,115,0.45)',
      background: 'rgba(222,190,115,0.08)',
      color: Colors.gold,
    },
    blocked: {
      border: 'rgba(186,38,43,0.55)',
      background: 'rgba(117,21,27,0.18)',
      color: Colors.textCrimson,
    },
    complete: {
      border: 'rgba(144,192,128,0.45)',
      background: 'rgba(80,112,64,0.14)',
      color: '#b6d49f',
    },
    danger: {
      border: 'rgba(224,80,64,0.55)',
      background: 'rgba(157,37,41,0.16)',
      color: '#efb199',
    },
    sealed: {
      border: 'rgba(155,118,70,0.62)',
      background: 'rgba(222,190,115,0.12)',
      color: Colors.goldDim,
    },
    waiting: {
      border: 'rgba(201,183,146,0.34)',
      background: 'rgba(21,13,9,0.18)',
      color: Colors.textMuted,
    },
  };
  const values = palette[tone];
  if (slot === 'text') return { color: values.color };
  if (slot === 'chip') {
    return { borderColor: values.border, backgroundColor: values.background };
  }
  return { borderColor: values.border };
}

function ActionBtn({ label, onPress, gold, flex, disabled }: {
  label: string; onPress: () => void; gold?: boolean; flex?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.btn,
        gold && styles.btnGold,
        flex && { flex: 1 },
        disabled && styles.btnDisabled,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.btnText, gold && styles.btnTextGold, disabled && styles.btnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        style={styles.stepBtn}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel="Decrease armies"
        accessibilityState={{ disabled: value <= min }}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        style={styles.stepBtn}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel="Increase armies"
        accessibilityState={{ disabled: value >= max }}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'territoryGrab': return 'CLAIMING';
    case 'election': return 'ELECTION';
    case 'initialDeploy': return 'DEPLOY';
    case 'chooseCapital': return 'CAPITAL';
    case 'reinforcement': return 'REINFORCE';
    case 'attack': return 'ATTACK';
    case 'fortify': return 'FORTIFY';
    case 'sameTimeReinforce': return 'REINFORCE (SIM)';
    case 'sameTimeBattle': return 'ORDERS (SIM)';
    case 'sameTimeMove': return 'MOVEMENT (SIM)';
    case 'gameOver': return 'END';
    default: return phase.toUpperCase();
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  playerName: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.text,
    fontFamily: 'Alegreya_600SemiBold',
    fontSize: 13,
    flexShrink: 1,
  },
  phase: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.goldDim,
    fontFamily: 'Alegreya_500Medium',
    fontSize: 10,
    letterSpacing: 2,
  },
  badge: { backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 11 },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,183,146,0.28)',
    backgroundColor: MapHud.control,
  },
  iconBtnPressed: { opacity: 0.72 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedName: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 13 },
  selectedArmies: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  ownerDot: { width: 8, height: 8, borderRadius: 4 },
  ownerSelf: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_500Medium', fontSize: 10, letterSpacing: 1 },
  allianceBadge: { ...MAP_HUD_TEXT_SHADOW, color: '#90a860', fontFamily: 'Alegreya_500Medium', fontSize: 10 },
  phaseHint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  hint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  commandStatus: {
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.36)',
    backgroundColor: 'rgba(21,13,9,0.16)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 6,
  },
  commandStatusHeadline: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: 'Alegreya_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  commandChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  commandChip: {
    minHeight: 26,
    borderWidth: 1,
    borderColor: 'rgba(201,183,146,0.28)',
    backgroundColor: 'rgba(21,13,9,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  commandChipLabel: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.textMuted,
    fontFamily: 'Alegreya_500Medium',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  commandChipValue: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.gold,
    fontFamily: 'Alegreya_700Bold',
    fontSize: 12,
  },
  actions: { gap: 6 },
  actionGroup: { gap: 6 },
  deployRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fortifyHint: { ...MAP_HUD_TEXT_SHADOW, flex: 1, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diceLabel: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_500Medium', fontSize: 13 },
  diceBtn: {
    width: 30, height: 30, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: MapHud.control, justifyContent: 'center', alignItems: 'center', borderRadius: 4,
  },
  diceBtnActive: { borderColor: Colors.gold, backgroundColor: MapHud.focused },
  diceBtnDisabled: { borderColor: Colors.disabled, opacity: 0.4 },
  diceBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontSize: 14, fontFamily: 'Alegreya_700Bold' },
  diceBtnTextActive: { color: Colors.gold },
  diceBtnTextDisabled: { color: Colors.disabledText },
  attackHint: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  stagedLabel: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 13 },
  ordersList: { maxHeight: 32 },
  orderChip: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: MapHud.control,
    paddingVertical: 6, paddingHorizontal: 10, marginRight: 6, justifyContent: 'center',
  },
  orderChipText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 11 },
  btn: {
    borderWidth: 1, borderColor: Colors.border, backgroundColor: MapHud.control,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  btnGold: { borderColor: Colors.gold, backgroundColor: MapHud.focused },
  btnDisabled: { borderColor: Colors.disabled, backgroundColor: MapHud.control },
  btnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 13, letterSpacing: 1 },
  btnTextGold: { color: Colors.gold },
  btnTextDisabled: { color: Colors.disabledText },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 32, height: 32, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: MapHud.control,
  },
  stepBtnText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 18 },
  stepValue: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 20, minWidth: 36, textAlign: 'center' },
});
