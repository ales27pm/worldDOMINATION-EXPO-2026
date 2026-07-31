import React, { useCallback, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { listCampaigns, listCommanderStats, listHighScores } from '@/db/repository';
import type { CampaignRecord, CommanderRecord, HighScoreRecord } from '@/db/types';
import { OBJECTIVE_INFO } from '@/game/types';
import type { Objective } from '@/game/types';
import { Colors } from '@/constants/colors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function objectiveName(obj: Objective | string): string {
  return OBJECTIVE_INFO[obj as Objective]?.name ?? String(obj);
}

/** "Hall of Records" — the campaign archive and lifetime commander ledger. */
export default function RecordsScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRecord[] | null>(null);
  const [commanders, setCommanders] = useState<CommanderRecord[]>([]);
  const [scores, setScores] = useState<HighScoreRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([listCampaigns(), listCommanderStats(), listHighScores()])
        .then(([c, commandersList, highScores]) => {
          if (!active) return;
          setCampaigns(c);
          setCommanders(commandersList);
          setScores(highScores);
        })
        .catch(() => {
          if (!active) return;
          setCampaigns([]);
          setCommanders([]);
          setScores([]);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const loading = campaigns === null;
  const list = campaigns ?? [];
  const humanWins = list.filter((c) => c.winnerIsHuman).length;
  const aiWins = list.length - humanWins;
  const longest = list.reduce((max, c) => Math.max(max, c.turns), 0);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.iconBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={21} color={Colors.gold} />
          </Pressable>
          <Text style={styles.title}>HALL OF RECORDS</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.divider} />

        {loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={Colors.gold} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.tagline}>
              Every concluded campaign, engraved in the imperial ledger.
            </Text>

            {/* I. Campaign Ledger */}
            <SectionTitle index="I" title="Campaign Ledger" />
            <View style={styles.statGrid}>
              <LedgerStat label="Campaigns" value={list.length} />
              <LedgerStat label="Human Victories" value={humanWins} />
              <LedgerStat label="AI Victories" value={aiWins} />
              <LedgerStat label="Longest (turns)" value={longest} />
            </View>

            {/* II. Tournament High Scores */}
            <SectionTitle index="II" title="Tournament High Scores" />
            {scores.length === 0 ? (
              <Text style={styles.emptyText}>No tournament scores have yet been recorded.</Text>
            ) : (
              <View style={styles.panel}>
                {scores.slice(0, 12).map((score, i) => (
                  <View
                    key={`${score.name}-${i}`}
                    style={[styles.scoreRow, score.isHuman && styles.scoreRowHuman]}
                  >
                    <Text style={styles.rank}>{i + 1}.</Text>
                    <Text style={styles.scoreName} numberOfLines={1}>
                      {i === 0 ? '★ ' : ''}
                      {score.name}
                    </Text>
                    <Text style={styles.kindTag}>{score.isHuman ? 'HUMAN' : 'AI'}</Text>
                    <Text style={styles.scoreStats}>
                      {score.score} pts · {score.gamesCompleted} games
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* III. Commanders of Renown */}
            <SectionTitle index="III" title="Commanders of Renown" />
            {commanders.length === 0 ? (
              <Text style={styles.emptyText}>No commander has yet concluded a campaign.</Text>
            ) : (
              <View style={styles.panel}>
                {commanders.slice(0, 10).map((commander, i) => (
                  <View
                    key={commander.name}
                    style={[
                      styles.commanderRow,
                      i === 0 && commander.wins > 0 && styles.commanderRowTop,
                    ]}
                  >
                    <Text style={styles.rank}>{i + 1}.</Text>
                    <Text style={styles.commanderName} numberOfLines={1}>
                      {commander.name}
                    </Text>
                    <Text style={styles.kindTag}>{commander.isHuman ? 'HUMAN' : 'AI'}</Text>
                    <Text style={styles.commanderStats}>
                      {commander.wins} {commander.wins === 1 ? 'win' : 'wins'} / {commander.games}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* IV. Campaign Archive */}
            <SectionTitle index="IV" title="Campaign Archive" />
            {list.length === 0 ? (
              <Text style={styles.emptyText}>
                The archive is empty. Conclude a campaign and history shall remember it.
              </Text>
            ) : (
              <View style={styles.archiveList}>
                {list.map((campaign) => (
                  <View key={campaign.id} style={styles.record}>
                    <View style={styles.recordHeader}>
                      <View style={[styles.colorDot, { backgroundColor: campaign.winnerColor }]} />
                      <Text style={styles.recordName} numberOfLines={1}>
                        {campaign.winnerName}
                      </Text>
                      <Ionicons
                        name="trophy-outline"
                        size={14}
                        color={Colors.gold}
                        style={styles.trophy}
                      />
                      <Text style={styles.recordObjective}>{objectiveName(campaign.objective)}</Text>
                    </View>
                    <Text style={styles.recordDetail}>
                      {campaign.winReason ? `Victory by ${campaign.winReason}. ` : ''}
                      {campaign.turns} turns · {campaign.playerCount} commanders · {campaign.battles}{' '}
                      battles · {campaign.territoryCount} territories
                    </Text>
                    <Text style={styles.recordDate}>{formatDate(campaign.completedAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function SectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionIndex}>{index}.</Text>
      <Text style={styles.sectionText}>{title.toUpperCase()}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function LedgerStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.36)',
    backgroundColor: 'rgba(21,13,9,0.18)',
  },
  iconBtnPressed: { opacity: 0.72 },
  headerSpacer: { width: 44, height: 44 },
  title: {
    color: Colors.gold, fontFamily: 'IMFellEnglishSC_400Regular', fontSize: 14,
    letterSpacing: 3,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: {
    color: Colors.textMuted, fontFamily: 'Alegreya_400Regular_Italic', fontSize: 14,
    paddingHorizontal: 4, marginBottom: 8,
  },
  scroll: { padding: 16, paddingBottom: 40 },
  tagline: {
    color: Colors.textMuted, fontFamily: 'Alegreya_400Regular_Italic', fontSize: 13,
    marginBottom: 16,
  },

  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionIndex: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 12 },
  sectionText: { color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11, letterSpacing: 3 },
  sectionRule: { flex: 1, height: 1, backgroundColor: Colors.border },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox: {
    flexGrow: 1, flexBasis: '45%',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard,
    paddingVertical: 12, alignItems: 'center', gap: 2,
  },
  statValue: { color: Colors.gold, fontFamily: 'Alegreya_800ExtraBold', fontSize: 22 },
  statLabel: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 2 },

  panel: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard, padding: 6, gap: 2 },
  commanderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7 },
  commanderRowTop: { borderWidth: 1, borderColor: Colors.goldDim, backgroundColor: 'rgba(222,190,115,0.08)' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7 },
  scoreRowHuman: { borderWidth: 1, borderColor: Colors.goldDim, backgroundColor: 'rgba(222,190,115,0.08)' },
  rank: { color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 12, width: 22 },
  commanderName: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 14, flex: 1 },
  scoreName: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 14, flex: 1 },
  kindTag: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 1.5 },
  commanderStats: { color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12, width: 86, textAlign: 'right' },
  scoreStats: { color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12, width: 126, textAlign: 'right' },

  archiveList: { gap: 8 },
  record: {
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    padding: 12, gap: 4,
  },
  recordHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: '#3a2812',
  },
  recordName: { color: Colors.text, fontFamily: 'Alegreya_600SemiBold', fontSize: 15, flexShrink: 1 },
  trophy: { marginLeft: 'auto' },
  recordObjective: {
    color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 10,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  recordDetail: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular_Italic', fontSize: 12, lineHeight: 17 },
  recordDate: { color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 9, letterSpacing: 2, opacity: 0.7 },
});
