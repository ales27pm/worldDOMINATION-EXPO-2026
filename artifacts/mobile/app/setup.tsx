import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Switch, Alert, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useGame } from '@/context/GameContext';
import { Colors } from '@/constants/colors';
import { GENERAL_LIST, GENERALS } from '@/game/generals';
import {
  ALLOCATION_OPTIONS,
  CARD_RULE_OPTIONS,
  OBJECTIVE_OPTIONS,
  TURN_STYLE_OPTIONS,
  mapSetupBriefing,
  optionByValue,
  setupBriefingLines,
} from '@/game/setupBriefing';
import { PLAYER_COLORS, TURN_STYLE_INFO } from '@/game/types';
import type { Allocation, CardRule, GeneralId, Objective, TurnStyle } from '@/game/types';

interface PlayerConfig {
  name: string;
  colorIdx: number;
  isHuman: boolean;
  generalId: GeneralId | null;
}

const AI_GENERALS = GENERAL_LIST.slice(0, 8);

export default function SetupScreen() {
  const router = useRouter();
  const { startGame } = useGame();
  const { width, height } = useWindowDimensions();
  const wideLayout = width >= 760 || width > height * 1.18;

  const [players, setPlayers] = useState<PlayerConfig[]>([
    { name: 'Commander', colorIdx: 0, isHuman: true, generalId: null },
    { name: 'Bonaparte', colorIdx: 1, isHuman: false, generalId: 'bonaparte' },
    { name: 'Wellington', colorIdx: 2, isHuman: false, generalId: 'wellington' },
  ]);
  const [objective, setObjective] = useState<Objective>('domination60');
  const [allocation, setAllocation] = useState<Allocation>('random');
  const [cardRule, setCardRule] = useState<CardRule>('ascending');
  const [extraTerritories, setExtraTerritories] = useState(false);
  const [turnStyle, setTurnStyle] = useState<TurnStyle>('classic');
  const [restrictedReinforcement, setRestrictedReinforcement] = useState(false);
  const objectiveBriefing = optionByValue(OBJECTIVE_OPTIONS, objective);
  const allocationBriefing = optionByValue(ALLOCATION_OPTIONS, allocation);
  const cardRuleBriefing = optionByValue(CARD_RULE_OPTIONS, cardRule);
  const turnStyleBriefing = optionByValue(TURN_STYLE_OPTIONS, turnStyle);
  const mapBriefing = mapSetupBriefing(extraTerritories);
  const launchBriefing = setupBriefingLines({
    objective,
    allocation,
    cardRule,
    turnStyle,
    useExtraTerritories: extraTerritories,
    restrictedReinforcement,
  });

  const addPlayer = () => {
    if (players.length >= 6) return;
    const usedColors = new Set(players.map((p) => p.colorIdx));
    const nextColor = [0, 1, 2, 3, 4, 5].find((c) => !usedColors.has(c)) ?? players.length;
    const gen = AI_GENERALS[players.length - 1];
    setPlayers([...players, {
      name: gen?.name ?? `Commander ${players.length + 1}`,
      colorIdx: nextColor,
      isHuman: false,
      generalId: gen?.id ?? null,
    }]);
  };

  const removePlayer = (idx: number) => {
    if (players.length <= 2) return;
    setPlayers(players.filter((_, i) => i !== idx));
  };

  const updatePlayer = (idx: number, update: Partial<PlayerConfig>) => {
    setPlayers(players.map((p, i) => i === idx ? { ...p, ...update } : p));
  };

  const handleStart = () => {
    const human = players.find((p) => p.isHuman);
    if (!human) {
      Alert.alert('Need a Commander', 'At least one player must be human.');
      return;
    }
    startGame({
      players: players.map((p) => ({
        name: p.name || (p.isHuman ? 'Commander' : 'General'),
        colorIdx: p.colorIdx,
        isHuman: p.isHuman,
        generalId: p.generalId,
      })),
      objective,
      useExtraTerritories: extraTerritories,
      cardRule,
      allocation,
      turnStyle,
      restrictedReinforcement: turnStyle === 'sameTime' ? restrictedReinforcement : undefined,
    });
    router.replace('/game');
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>NEW CAMPAIGN</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.divider} />

        <ScrollView contentContainerStyle={[styles.content, wideLayout && styles.contentWide]}>
          {/* Players */}
          <Section title="COMMANDERS">
            <BriefingNote
              title="Command table"
              lines={[
                'Human commanders receive handoff prompts for private missions and orders.',
                'AI generals use distinct aggression, risk tolerance, unpredictability and honor.',
              ]}
            />
            {players.map((p, idx) => (
              <PlayerRow
                key={idx}
                player={p}
                idx={idx}
                canRemove={players.length > 2}
                onChange={(u) => updatePlayer(idx, u)}
                onRemove={() => removePlayer(idx)}
              />
            ))}
            {players.length < 6 && (
              <Pressable onPress={addPlayer} style={styles.addBtn}>
                <Text style={styles.addBtnText}>+ Add Commander</Text>
              </Pressable>
            )}
          </Section>

          {/* Objective */}
          <Section title="VICTORY OBJECTIVE">
            <SegmentedPicker
              options={OBJECTIVE_OPTIONS}
              value={objective}
              onChange={(v) => setObjective(v as Objective)}
            />
            <BriefingNote
              title={objectiveBriefing.label}
              lines={[objectiveBriefing.desc, objectiveBriefing.tableCue]}
            />
          </Section>

          {/* Allocation */}
          <Section title="TERRITORY ALLOCATION">
            <SegmentedPicker
              options={ALLOCATION_OPTIONS}
              value={allocation}
              onChange={(v) => setAllocation(v as Allocation)}
            />
            <BriefingNote
              title={allocationBriefing.label}
              lines={[allocationBriefing.desc, allocationBriefing.tableCue]}
            />
          </Section>

          {/* Card Rule */}
          <Section title="CARD TRADING RULE">
            <SegmentedPicker
              options={CARD_RULE_OPTIONS}
              value={cardRule}
              onChange={(v) => setCardRule(v as CardRule)}
            />
            <BriefingNote
              title={cardRuleBriefing.label}
              lines={[cardRuleBriefing.desc, cardRuleBriefing.tableCue]}
            />
          </Section>

          {/* Turn Style */}
          <Section title="TURN STYLE">
            <SegmentedPicker
              options={TURN_STYLE_OPTIONS}
              value={turnStyle}
              onChange={(v) => setTurnStyle(v as TurnStyle)}
            />
            <BriefingNote
              title={turnStyleBriefing.label}
              lines={[
                TURN_STYLE_INFO[turnStyle].description,
                turnStyleBriefing.tableCue,
              ]}
            />
            {turnStyle === 'sameTime' && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Restricted Reinforcement</Text>
                  <Text style={styles.switchDesc}>
                    Cap each turn's reinforcements so no commander can dump every army in one spot.
                  </Text>
                </View>
                <Switch
                  value={restrictedReinforcement}
                  onValueChange={setRestrictedReinforcement}
                  trackColor={{ true: Colors.gold, false: Colors.border }}
                  thumbColor={restrictedReinforcement ? Colors.goldDim : Colors.textMuted}
                />
              </View>
            )}
          </Section>

          {/* Extra Territories */}
          <Section title="MAP OPTIONS">
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Extended Map</Text>
                <Text style={styles.switchDesc}>
                  {extraTerritories ? 'Enabled' : 'Disabled'}: {mapBriefing.territoryCount} territories. {mapBriefing.desc}
                </Text>
              </View>
              <Switch
                value={extraTerritories}
                onValueChange={setExtraTerritories}
                trackColor={{ true: Colors.gold, false: Colors.border }}
                thumbColor={extraTerritories ? Colors.goldDim : Colors.textMuted}
              />
            </View>
            <BriefingNote title={mapBriefing.label} lines={[mapBriefing.tableCue]} />
          </Section>

          <Section title="CAMPAIGN ORDER">
            <View style={styles.summaryPanel}>
              {launchBriefing.map((line) => (
                <Text key={line} style={styles.summaryLine}>
                  {line}
                </Text>
              ))}
            </View>
          </Section>

          {/* Start Button */}
          <Pressable onPress={handleStart} style={styles.startBtn}>
            <Text style={styles.startBtnText}>⚔ LAUNCH CAMPAIGN</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function BriefingNote({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={styles.briefingNote}>
      <Text style={styles.briefingTitle}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.briefingText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function PlayerRow({
  player, idx, canRemove, onChange, onRemove,
}: {
  player: PlayerConfig;
  idx: number;
  canRemove: boolean;
  onChange: (u: Partial<PlayerConfig>) => void;
  onRemove: () => void;
}) {
  const color = PLAYER_COLORS[player.colorIdx]?.hex ?? '#888';
  const general = player.generalId ? GENERALS[player.generalId] : null;
  return (
    <View style={styles.playerCard}>
      <View style={styles.playerRow}>
        <View style={[styles.colorDot, { backgroundColor: color }]} />
        <TextInput
          style={[styles.nameInput, { color: Colors.text }]}
          value={player.name}
          onChangeText={(name) => onChange({ name })}
          placeholderTextColor={Colors.textMuted}
          maxLength={20}
        />
        <View style={styles.humanToggle}>
          <Text style={styles.humanLabel}>{player.isHuman ? 'Human' : 'AI'}</Text>
          <Switch
            value={player.isHuman}
            onValueChange={(v) => onChange({ isHuman: v, generalId: v ? null : (AI_GENERALS[idx]?.id ?? null) })}
            trackColor={{ true: Colors.gold, false: Colors.border }}
            thumbColor={player.isHuman ? Colors.goldDim : Colors.textMuted}
            style={{ transform: [{ scale: 0.75 }] }}
          />
        </View>
        {canRemove && (
          <Pressable onPress={onRemove} style={styles.removeBtn}>
            <Text style={styles.removeBtnText}>✕</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.commanderBrief} numberOfLines={3}>
        {player.isHuman
          ? 'Local commander: handoff privacy, manual decisions and direct table feedback.'
          : general
            ? `${general.name}: ${general.description}`
            : 'AI general: automated campaign decisions.'}
      </Text>
    </View>
  );
}

function SegmentedPicker<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.picker}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.pickerOpt, opt.value === value && styles.pickerOptSelected]}
        >
          <Text style={[styles.pickerOptText, opt.value === value && styles.pickerOptTextSelected]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 8 },
  backText: { color: Colors.gold, fontFamily: 'Alegreya_500Medium', fontSize: 14 },
  title: { color: Colors.gold, fontFamily: 'IMFellEnglishSC_400Regular', fontSize: 14, letterSpacing: 3 },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  content: { padding: 16, gap: 24, paddingBottom: 40 },
  contentWide: { width: '100%', maxWidth: 920, alignSelf: 'center' },
  section: { gap: 10 },
  sectionTitle: {
    color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11,
    letterSpacing: 3, textTransform: 'uppercase',
  },
  sectionContent: { gap: 8 },
  briefingNote: {
    backgroundColor: 'rgba(238,229,201,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  briefingTitle: {
    color: Colors.gold,
    fontFamily: 'Alegreya_600SemiBold',
    fontSize: 13,
  },
  briefingText: {
    color: Colors.textMuted,
    fontFamily: 'Alegreya_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  playerCard: {
    backgroundColor: Colors.bgCard,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  commanderBrief: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12, lineHeight: 16 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  nameInput: {
    flex: 1, fontFamily: 'Alegreya_500Medium', fontSize: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 2,
  },
  humanToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  humanLabel: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
  removeBtn: { padding: 4 },
  removeBtnText: { color: Colors.crimson, fontSize: 14 },
  addBtn: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center',
  },
  addBtnText: { color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 14 },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerOpt: {
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
  },
  pickerOptSelected: { borderColor: Colors.gold, backgroundColor: '#2a1d08' },
  pickerOptText: { color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12 },
  pickerOptTextSelected: { color: Colors.gold },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.bgCard, padding: 12, borderWidth: 1, borderColor: Colors.border },
  switchLabel: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 14 },
  switchDesc: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12, marginTop: 2 },
  summaryPanel: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 6,
  },
  summaryLine: {
    color: Colors.textMuted,
    fontFamily: 'Alegreya_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  startBtn: {
    backgroundColor: Colors.gold, paddingVertical: 18, alignItems: 'center', marginTop: 8,
  },
  startBtnText: {
    color: Colors.bg, fontFamily: 'Alegreya_700Bold', fontSize: 16, letterSpacing: 3,
  },
});
