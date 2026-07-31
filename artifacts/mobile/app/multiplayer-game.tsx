import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { mapRendererModeFromParam } from '@/game/mapRendererMode';
import type { GameAction } from '@/game/types';
import { CampaignScreen } from './game';
import {
  createMultiplayerClient,
  MultiplayerApiError,
  type MultiplayerClient,
  type MultiplayerSnapshot,
} from '@/lib/multiplayerClient';
import {
  loadMultiplayerSession,
  type MultiplayerLocalSession,
} from '@/lib/multiplayerSession';
import {
  multiplayerActionStatus,
  submitMultiplayerGameplayAction,
} from '@/lib/multiplayerGameplay';

export default function MultiplayerGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ renderer?: string | string[] }>();
  const [session, setSession] = useState<MultiplayerLocalSession | null>(null);
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot | null>(null);
  const [status, setStatus] = useState('Loading multiplayer session.');
  const [liveMode, setLiveMode] = useState('off');
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => {
    if (!session) return null;
    try {
      return createMultiplayerClient(session.apiBaseUrl, undefined, {
        apiAuthToken: session.apiAuthToken,
      });
    } catch {
      return null;
    }
  }, [session]);

  const reportError = useCallback((error: unknown) => {
    if (error instanceof MultiplayerApiError) {
      setStatus(`${error.code}: ${error.message}`);
      return;
    }
    setStatus(error instanceof Error ? error.message : 'Multiplayer gameplay request failed.');
  }, []);

  const refreshSnapshot = useCallback(async (
    nextSession: MultiplayerLocalSession,
    nextClient: MultiplayerClient,
  ) => {
    setBusy(true);
    try {
      const next = await nextClient.getSnapshot(nextSession.matchId, nextSession.playerToken);
      setSnapshot(next);
      setStatus(`Snapshot refreshed at version ${next.version}.`);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [reportError]);

  useEffect(() => {
    let cancelled = false;
    loadMultiplayerSession(AsyncStorage)
      .then((saved) => {
        if (cancelled) return;
        if (!saved) {
          setStatus('No linked multiplayer match.');
          return;
        }
        setSession(saved);
      })
      .catch(reportError);
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  useEffect(() => {
    if (!session || !client) {
      setLiveMode('off');
      return undefined;
    }
    let active = true;
    void refreshSnapshot(session, client);
    const subscription = client.watchSnapshot(
      session.matchId,
      session.playerToken,
      (next) => {
        if (!active) return;
        setSnapshot(next);
        setStatus(`Live snapshot version ${next.version}.`);
      },
      reportError,
    );
    setLiveMode(subscription.mode === 'websocket' ? 'websocket' : subscription.mode === 'events' ? 'event stream' : 'polling');
    return () => {
      active = false;
      subscription.close();
    };
  }, [client, refreshSnapshot, reportError, session]);

  const submitAction = useCallback(async (action: GameAction) => {
    if (!client || !session || !snapshot) {
      setStatus('No linked multiplayer match.');
      return;
    }
    setBusy(true);
    try {
      const result = await submitMultiplayerGameplayAction({
        client,
        session,
        snapshot,
        action,
      });
      setSnapshot(result.snapshot);
      setStatus(
        result.refreshedAfterConflict
          ? `Version conflict; refreshed to version ${result.snapshot.version}.`
          : multiplayerActionStatus(action, result.snapshot.version),
      );
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [client, reportError, session, snapshot]);

  if (!snapshot) {
    return (
      <View style={styles.emptyContainer}>
        <SafeAreaView style={styles.emptyInner}>
          <Text style={styles.emptyTitle}>MULTIPLAYER BATTLEFIELD</Text>
          <Text style={styles.emptyBody}>{status}</Text>
          {busy && <ActivityIndicator color={Colors.gold} />}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/multiplayer')}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>Return to Command</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <CampaignScreen
      game={snapshot.state}
      dispatchAction={submitAction}
      localPlayerId={snapshot.you}
      actionBusy={busy}
      disableAi
      onExit={() => router.replace('/multiplayer')}
      onVictoryExit={() => router.replace('/multiplayer')}
      onActionError={reportError}
      initialRendererMode={mapRendererModeFromParam(params.renderer)}
      statusBanner={
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerTitle}>MULTIPLAYER BATTLEFIELD</Text>
          <Text style={styles.bannerMeta} numberOfLines={1}>
            Match {snapshot.id} | v{snapshot.version} | You P{snapshot.you ?? 'observer'} | {liveMode}
          </Text>
          <Text style={styles.bannerStatus} numberOfLines={1}>{status}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: { flex: 1, backgroundColor: Colors.bg },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  emptyTitle: {
    color: Colors.gold,
    fontFamily: 'IMFellEnglishSC_400Regular',
    fontSize: 16,
    letterSpacing: 3,
    textAlign: 'center',
  },
  emptyBody: {
    color: Colors.textMuted,
    fontFamily: 'Alegreya_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyButton: {
    borderWidth: 1,
    borderColor: Colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.bgCard,
  },
  emptyButtonText: {
    color: Colors.gold,
    fontFamily: 'Alegreya_700Bold',
    fontSize: 13,
    letterSpacing: 1,
  },
  banner: {
    marginHorizontal: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.3)',
    backgroundColor: 'rgba(21,13,9,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  bannerTitle: {
    color: Colors.gold,
    fontFamily: 'Alegreya_700Bold',
    fontSize: 10,
    letterSpacing: 2,
  },
  bannerMeta: {
    color: Colors.text,
    fontFamily: 'Alegreya_500Medium',
    fontSize: 11,
  },
  bannerStatus: {
    color: Colors.textMuted,
    fontFamily: 'Alegreya_400Regular',
    fontSize: 10,
  },
});
