import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Colors } from '@/constants/colors';
import { MAP_HUD_TEXT_SHADOW } from '@/constants/mapHud';
import { resolveMultiplayerCommandLayout } from '@/game/multiplayerCommandLayout';
import {
  createMultiplayerClientSessionId,
  createMultiplayerClient,
  defaultMultiplayerApiAuthToken,
  defaultMultiplayerApiBaseUrl,
  MultiplayerApiError,
  type MultiplayerContactSummary,
  type MultiplayerInvitationSummary,
  type MultiplayerInvitationSubscription,
  type MultiplayerMatchListScope,
  type MultiplayerMatchListStatus,
  type MultiplayerMatchSummary,
  type MultiplayerSnapshot,
} from '@/lib/multiplayerClient';
import {
  clearMultiplayerSession,
  loadMultiplayerSession,
  saveMultiplayerSession,
  type MultiplayerLocalSession,
} from '@/lib/multiplayerSession';
import type { GameSetup } from '@/game/types';

const COMMAND_TABLE_TEXTURE = require('../assets/ui/command-table-walnut.webp') as number;
const PARCHMENT_PANEL_TEXTURE = require('../assets/ui/parchment-panel.webp') as number;
const IMPERIAL_COMMAND_SEAL = require('../assets/ui/imperial-command-seal.png') as number;

function defaultSetup(name: string): GameSetup {
  return {
    players: [
      { name: name.trim() || 'Commander', colorIdx: 0, isHuman: true, generalId: null },
      { name: 'Rival Commander', colorIdx: 1, isHuman: true, generalId: null },
    ],
    objective: 'domination60',
    useExtraTerritories: false,
    allocation: 'random',
    cardRule: 'ascending',
    turnStyle: 'sameTime',
    restrictedReinforcement: true,
  };
}

function formatSavedAt(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'saved locally';
  return `saved ${new Date(parsed).toLocaleString()}`;
}

function firstOpenInvitableSeat(snapshot: MultiplayerSnapshot): number | null {
  return snapshot.seats.find((seat) => seat.isHuman && !seat.claimed && !seat.invited)?.playerId ?? null;
}

const LOBBY_STATUS_OPTIONS: Array<{ value: MultiplayerMatchListStatus; label: string }> = [
  { value: 'joinable', label: 'Joinable' },
  { value: 'active', label: 'Active' },
  { value: 'finished', label: 'Finished' },
  { value: 'all', label: 'All' },
];

const LOBBY_SCOPE_OPTIONS: Array<{ value: MultiplayerMatchListScope; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'mine', label: 'Mine' },
];

export default function MultiplayerScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(
    () => resolveMultiplayerCommandLayout({ width, height, insets }),
    [height, insets, width],
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultMultiplayerApiBaseUrl());
  const [apiAuthToken, setApiAuthToken] = useState(defaultMultiplayerApiAuthToken());
  const [playerName, setPlayerName] = useState('Commander');
  const [joinMatchId, setJoinMatchId] = useState('');
  const [joinPlayerId, setJoinPlayerId] = useState('1');
  const [invitePlayerId, setInvitePlayerId] = useState('1');
  const [inviteUserId, setInviteUserId] = useState('');
  const [session, setSession] = useState<MultiplayerLocalSession | null>(null);
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot | null>(null);
  const [lobbyMatches, setLobbyMatches] = useState<MultiplayerMatchSummary[]>([]);
  const [contacts, setContacts] = useState<MultiplayerContactSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<MultiplayerInvitationSummary[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<MultiplayerMatchListStatus>('joinable');
  const [lobbyScope, setLobbyScope] = useState<MultiplayerMatchListScope>('public');
  const [status, setStatus] = useState('No linked match.');
  const [busy, setBusy] = useState(false);
  const [liveMode, setLiveMode] = useState('off');
  const [invitationLiveMode, setInvitationLiveMode] = useState('off');
  const invitationWatchRef = useRef<MultiplayerInvitationSubscription | null>(null);

  const client = useMemo(() => {
    try {
      return createMultiplayerClient(apiBaseUrl, undefined, { apiAuthToken });
    } catch {
      return null;
    }
  }, [apiAuthToken, apiBaseUrl]);

  const reportError = useCallback((error: unknown) => {
    if (error instanceof MultiplayerApiError) {
      setStatus(`${error.code}: ${error.message}`);
      return;
    }
    setStatus(error instanceof Error ? error.message : 'Multiplayer request failed.');
  }, []);

  const persistSession = useCallback(async (
    baseUrl: string,
    authToken: string,
    matchId: string,
    playerToken: string,
    playerId: number,
    sessionId?: string | null,
    sessionLabel?: string,
  ) => {
    const saved = await saveMultiplayerSession(AsyncStorage, {
      apiBaseUrl: baseUrl,
      ...(authToken.trim() ? { apiAuthToken: authToken.trim() } : {}),
      matchId,
      playerToken,
      playerId,
      ...(sessionId ? { sessionId } : {}),
      ...(sessionLabel?.trim() ? { sessionLabel: sessionLabel.trim() } : {}),
    });
    setSession(saved);
    return saved;
  }, []);

  const refreshSnapshot = useCallback(async (nextSession = session) => {
    if (!nextSession) {
      setStatus('No linked match.');
      return;
    }
    setBusy(true);
    try {
      const nextClient = createMultiplayerClient(nextSession.apiBaseUrl, undefined, {
        apiAuthToken: nextSession.apiAuthToken,
      });
      const next = await nextClient.getSnapshot(nextSession.matchId, nextSession.playerToken);
      setSnapshot(next);
      setStatus(`Linked to match ${next.id} at version ${next.version}.`);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [reportError, session]);

  useEffect(() => {
    let cancelled = false;
    loadMultiplayerSession(AsyncStorage)
      .then((saved) => {
        if (cancelled || !saved) return;
        setSession(saved);
        setApiBaseUrl(saved.apiBaseUrl);
        setApiAuthToken(saved.apiAuthToken ?? defaultMultiplayerApiAuthToken());
        setJoinMatchId(saved.matchId);
        setJoinPlayerId(String(saved.playerId));
        setStatus(`Reconnect token ${formatSavedAt(saved.updatedAt)}.`);
        return refreshSnapshot(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!session) {
      setLiveMode('off');
      return undefined;
    }

    let active = true;
    try {
      const nextClient = createMultiplayerClient(session.apiBaseUrl, undefined, {
        apiAuthToken: session.apiAuthToken,
      });
      const subscription = nextClient.watchSnapshot(
        session.matchId,
        session.playerToken,
        (next) => {
          if (!active) return;
          setSnapshot(next);
          setStatus(`Linked to match ${next.id} at version ${next.version}.`);
        },
        reportError,
      );
      setLiveMode(subscription.mode === 'websocket' ? 'websocket' : subscription.mode === 'events' ? 'event stream' : 'polling');
      return () => {
        active = false;
        subscription.close();
      };
    } catch (error) {
      reportError(error);
      setLiveMode('off');
      return undefined;
    }
  }, [reportError, session]);

  useEffect(() => {
    setInvitationLiveMode('off');
    return () => {
      invitationWatchRef.current?.close();
      invitationWatchRef.current = null;
    };
  }, [client]);

  const createHostMatch = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    setBusy(true);
    try {
      const sessionId = createMultiplayerClientSessionId();
      const sessionLabel = playerName.trim() || 'Commander';
      const result = await client.createMatch({
        setup: defaultSetup(playerName),
        hostPlayerId: 0,
        sessionId,
        sessionLabel,
      });
      const saved = await persistSession(
        apiBaseUrl,
        apiAuthToken,
        result.snapshot.id,
        result.playerToken,
        0,
        result.sessionId ?? sessionId,
        sessionLabel,
      );
      setSnapshot(result.snapshot);
      setJoinMatchId(result.snapshot.id);
      setJoinPlayerId('0');
      const openSeat = firstOpenInvitableSeat(result.snapshot);
      if (openSeat != null) setInvitePlayerId(String(openSeat));
      setStatus(`Created host seat for match ${result.snapshot.id}.`);
      void refreshSnapshot(saved);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [apiAuthToken, apiBaseUrl, client, persistSession, playerName, refreshSnapshot, reportError]);

  const quickMatch = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    setBusy(true);
    try {
      const sessionId = createMultiplayerClientSessionId();
      const sessionLabel = playerName.trim() || 'Commander';
      const result = await client.quickMatch({
        setup: defaultSetup(playerName),
        playerName: playerName.trim() || undefined,
        sessionId,
        sessionLabel,
      });
      const playerId = result.snapshot.you ?? 0;
      const saved = await persistSession(
        apiBaseUrl,
        apiAuthToken,
        result.snapshot.id,
        result.playerToken,
        playerId,
        result.sessionId ?? sessionId,
        sessionLabel,
      );
      setSnapshot(result.snapshot);
      setJoinMatchId(result.snapshot.id);
      setJoinPlayerId(String(playerId));
      const openSeat = firstOpenInvitableSeat(result.snapshot);
      if (openSeat != null) setInvitePlayerId(String(openSeat));
      setStatus(
        result.matchSource === 'joined'
          ? `Quick matched into player ${playerId} in match ${result.snapshot.id}.`
          : `Created quick match ${result.snapshot.id}.`,
      );
      void refreshSnapshot(saved);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [apiAuthToken, apiBaseUrl, client, persistSession, playerName, refreshSnapshot, reportError]);

  const joinSeat = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    const playerId = Number(joinPlayerId);
    if (!Number.isInteger(playerId)) {
      setStatus('Player id must be an integer.');
      return;
    }
    const matchId = joinMatchId.trim();
    if (!matchId) {
      setStatus('Enter a match id.');
      return;
    }
    setBusy(true);
    try {
      const sessionId = createMultiplayerClientSessionId();
      const sessionLabel = playerName.trim() || `Player ${playerId}`;
      const result = await client.joinMatch(matchId, {
        playerId,
        playerName: playerName.trim() || undefined,
        sessionId,
        sessionLabel,
      });
      const saved = await persistSession(
        apiBaseUrl,
        apiAuthToken,
        result.snapshot.id,
        result.playerToken,
        playerId,
        result.sessionId ?? sessionId,
        sessionLabel,
      );
      setSnapshot(result.snapshot);
      setStatus(`Joined player ${playerId} in match ${result.snapshot.id}.`);
      void refreshSnapshot(saved);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [apiAuthToken, apiBaseUrl, client, joinMatchId, joinPlayerId, persistSession, playerName, refreshSnapshot, reportError]);

  const refreshLobby = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    setBusy(true);
    try {
      const matches = await client.listMatches({ limit: 12, status: lobbyStatus, scope: lobbyScope });
      const label = lobbyScope === 'mine' ? `your ${lobbyStatus}` : lobbyStatus;
      setLobbyMatches(matches);
      setStatus(matches.length ? `Loaded ${matches.length} ${label} matches.` : `No ${label} matches found.`);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [client, lobbyScope, lobbyStatus, reportError]);

  const refreshInvitations = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    setBusy(true);
    try {
      const invitations = await client.listInvitations({ limit: 12 });
      setPendingInvitations(invitations);
      setStatus(invitations.length ? `Loaded ${invitations.length} pending invitations.` : 'No pending invitations found.');
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [client, reportError]);

  const refreshContacts = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    setBusy(true);
    try {
      const nextContacts = await client.listContacts();
      setContacts(nextContacts);
      setStatus(nextContacts.length ? `Loaded ${nextContacts.length} trusted contacts.` : 'No trusted contacts found.');
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [client, reportError]);

  const toggleInvitationWatch = useCallback(() => {
    if (invitationWatchRef.current) {
      invitationWatchRef.current.close();
      invitationWatchRef.current = null;
      setInvitationLiveMode('off');
      setStatus('Invitation alerts stopped.');
      return;
    }
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    const subscription = client.watchInvitations(
      (invitations) => {
        setPendingInvitations(invitations);
        setStatus(invitations.length ? `Received ${invitations.length} pending invitation alerts.` : 'No pending invitation alerts.');
      },
      reportError,
      { limit: 12 },
    );
    invitationWatchRef.current = subscription;
    setInvitationLiveMode(subscription.mode === 'events' ? 'event stream' : 'polling');
    setStatus(`Invitation alerts using ${subscription.mode === 'events' ? 'event stream' : 'polling'}.`);
  }, [client, reportError]);

  const inviteSeat = useCallback(async () => {
    if (!client) {
      setStatus('Enter a valid API base URL.');
      return;
    }
    if (!session) {
      setStatus('Create or reconnect to a match before inviting a seat.');
      return;
    }
    const playerId = Number(invitePlayerId);
    if (!Number.isInteger(playerId)) {
      setStatus('Invite player id must be an integer.');
      return;
    }
    const invitedUserId = inviteUserId.trim();
    if (!invitedUserId) {
      setStatus('Enter a trusted user id to invite.');
      return;
    }
    setBusy(true);
    try {
      const result = await client.inviteSeat(session.matchId, {
        playerToken: session.playerToken,
        ...(session.sessionId ? { sessionId: session.sessionId } : {}),
        playerId,
        invitedUserId,
      });
      setSnapshot(result.snapshot);
      const openSeat = firstOpenInvitableSeat(result.snapshot);
      if (openSeat != null) setInvitePlayerId(String(openSeat));
      setStatus(`Invited trusted user ${invitedUserId} to player ${playerId}.`);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }, [client, invitePlayerId, inviteUserId, reportError, session]);

  const useLobbyMatch = useCallback((match: MultiplayerMatchSummary) => {
    const playerId = match.openHumanSeats[0] ?? match.seats.find((seat) => seat.isHuman)?.playerId ?? 1;
    setJoinMatchId(match.id);
    setJoinPlayerId(String(playerId));
    setStatus(`Selected match ${match.id}.`);
  }, []);

  const useInvitation = useCallback((invitation: MultiplayerInvitationSummary) => {
    setJoinMatchId(invitation.matchId);
    setJoinPlayerId(String(invitation.playerId));
    setStatus(`Selected invitation from ${invitation.invitedByPlayerName}.`);
  }, []);

  const useContact = useCallback((contact: MultiplayerContactSummary) => {
    setInviteUserId(contact.userId);
    setStatus(`Selected contact ${contact.displayName ?? contact.userId}.`);
  }, []);

  const clearSession = useCallback(() => {
    const run = () => {
      void clearMultiplayerSession(AsyncStorage).then(() => {
        setSession(null);
        setSnapshot(null);
        setStatus('Local reconnect token cleared.');
      });
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Clear the local multiplayer reconnect token?')) run();
      return;
    }
    Alert.alert('Clear Reconnect Token?', 'This removes only the local token on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: run },
    ]);
  }, []);

  const aliveNames = snapshot?.state.players.filter((player) => player.alive).map((player) => player.name) ?? [];
  const serverReady = client ? 'API ROUTE READY' : 'API ROUTE NEEDED';
  const authState = apiAuthToken.trim() ? 'AUTH TOKEN SET' : 'NO SHARED TOKEN';
  const linkedState = session ? `MATCH V${snapshot?.version ?? '-'} LINKED` : 'NO LINKED MATCH';
  const sectionStyle = { width: layout.sectionWidth };
  const wideSectionStyle = { width: layout.wideSectionWidth };

  return (
    <ImageBackground
      source={COMMAND_TABLE_TEXTURE}
      style={styles.container}
      imageStyle={styles.tableTexture}
      resizeMode="cover"
    >
      <View style={styles.tableShade} />
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View
          style={[
            styles.header,
            {
              maxWidth: layout.contentMaxWidth,
              paddingLeft: layout.contentPaddingLeft,
              paddingRight: layout.contentPaddingRight,
              flexDirection: layout.headerDirection,
            },
          ]}
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
            <Text style={styles.backText}>{'< Back'}</Text>
          </Pressable>
          <View style={styles.titleBlock}>
            <Image
              source={IMPERIAL_COMMAND_SEAL}
              style={{ width: layout.sealSize, height: layout.sealSize }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.titleTextBlock}>
              <Text style={styles.title}>MULTIPLAYER COMMAND</Text>
              <Text style={styles.subtitle}>Server-authoritative Same Time command board</Text>
            </View>
          </View>
          <View style={styles.statusCluster}>
            <StatusPill label={serverReady} tone={client ? 'gold' : 'crimson'} />
            <StatusPill label={authState} />
            <StatusPill label={linkedState} tone={session ? 'gold' : 'muted'} />
          </View>
        </View>
        <View style={[styles.divider, { maxWidth: layout.contentMaxWidth }]} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              maxWidth: layout.contentMaxWidth,
              paddingTop: layout.contentPaddingTop,
              paddingRight: layout.contentPaddingRight,
              paddingBottom: layout.contentPaddingBottom,
              paddingLeft: layout.contentPaddingLeft,
            },
          ]}
        >
          <Section title="SERVER" style={sectionStyle}>
            <Text style={styles.label}>API Base URL</Text>
            <TextInput
              accessibilityLabel="API Base URL"
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              placeholder="https://example.com/api"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.label}>API Auth Token</Text>
            <TextInput
              accessibilityLabel="API Auth Token"
              value={apiAuthToken}
              onChangeText={setApiAuthToken}
              placeholder="optional"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
          </Section>

          <Section title="COMMANDER" style={sectionStyle}>
            <Text style={styles.label}>Commander Name</Text>
            <TextInput
              accessibilityLabel="Commander Name"
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="Commander"
              placeholderTextColor={Colors.textMuted}
              maxLength={40}
              style={styles.input}
            />
          </Section>

          <Section title="HOST" style={sectionStyle}>
            <Text style={styles.body}>
              Find a public Same Time RISK seat or create a server-owned match. Manual host claims player 0.
            </Text>
            <CommandButton label="Quick Match" onPress={quickMatch} disabled={busy} primary />
            <CommandButton label="Create Host Seat" onPress={createHostMatch} disabled={busy} />
          </Section>

          <Section title="LOBBY" style={wideSectionStyle}>
            <View style={styles.filterRow}>
              {LOBBY_STATUS_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lobbyStatus === option.value }}
                  onPress={() => {
                    setLobbyStatus(option.value);
                    setLobbyMatches([]);
                  }}
                  style={[styles.filterButton, lobbyStatus === option.value && styles.filterButtonActive]}
                >
                  <Text
                    style={[styles.filterText, lobbyStatus === option.value && styles.filterTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {LOBBY_SCOPE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: lobbyScope === option.value }}
                  onPress={() => {
                    setLobbyScope(option.value);
                    setLobbyMatches([]);
                  }}
                  style={[styles.filterButton, lobbyScope === option.value && styles.filterButtonActive]}
                >
                  <Text
                    style={[styles.filterText, lobbyScope === option.value && styles.filterTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <CommandButton label="Refresh Lobby" onPress={refreshLobby} disabled={busy} />
            {lobbyMatches.map((match) => (
              <Pressable key={match.id} onPress={() => useLobbyMatch(match)} style={styles.lobbyRow}>
                <Text style={styles.lobbyTitle} numberOfLines={1}>Match {match.id}</Text>
                <Text style={styles.meta}>
                  {match.lobbyStatus} - v{match.version} - {match.phase} - {match.openSeatCount} open - turn {match.turn}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {match.seats.map((seat) => `P${seat.playerId} ${seat.claimed ? 'claimed' : 'open'}`).join(' | ')}
                </Text>
              </Pressable>
            ))}
          </Section>

          <Section title="PENDING INVITATIONS" style={sectionStyle}>
            <Text style={styles.meta}>Invitation alerts {invitationLiveMode}</Text>
            <CommandButton label="Refresh Invitations" onPress={refreshInvitations} disabled={busy} />
            <CommandButton
              label={invitationLiveMode === 'off' ? 'Watch Invitations' : 'Stop Alerts'}
              onPress={toggleInvitationWatch}
              disabled={busy}
            />
            {pendingInvitations.map((invitation) => (
              <Pressable
                key={`${invitation.matchId}:${invitation.playerId}`}
                onPress={() => useInvitation(invitation)}
                style={styles.lobbyRow}
              >
                <Text style={styles.lobbyTitle} numberOfLines={1}>Match {invitation.matchId}</Text>
                <Text style={styles.meta}>
                  Seat P{invitation.playerId} - invited by {invitation.invitedByPlayerName}
                </Text>
                <Text style={styles.meta}>
                  {invitation.lobbyStatus} - v{invitation.matchVersion} - {invitation.phase} - turn {invitation.turn}
                </Text>
              </Pressable>
            ))}
          </Section>

          <Section title="CONTACTS" style={sectionStyle}>
            <CommandButton label="Refresh Contacts" onPress={refreshContacts} disabled={busy} />
            {contacts.map((contact) => (
              <Pressable
                key={contact.userId}
                onPress={() => useContact(contact)}
                style={styles.lobbyRow}
              >
                <Text style={styles.lobbyTitle} numberOfLines={1}>{contact.displayName ?? contact.userId}</Text>
                <Text style={styles.meta} numberOfLines={1}>{contact.userId}</Text>
              </Pressable>
            ))}
          </Section>

          <Section title="INVITE SEAT" style={sectionStyle}>
            <Text style={styles.label}>Invite Player ID</Text>
            <TextInput
              accessibilityLabel="Invite Player ID"
              value={invitePlayerId}
              onChangeText={setInvitePlayerId}
              placeholder="1"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />
            <Text style={styles.label}>Trusted User ID</Text>
            <TextInput
              accessibilityLabel="Trusted User ID"
              value={inviteUserId}
              onChangeText={setInviteUserId}
              placeholder="user-ben-0001"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <CommandButton label="Invite Seat" onPress={inviteSeat} disabled={busy || !session} />
          </Section>

          <Section title="JOIN" style={sectionStyle}>
            <Text style={styles.label}>Match ID</Text>
            <TextInput
              accessibilityLabel="Match ID"
              value={joinMatchId}
              onChangeText={setJoinMatchId}
              placeholder="match uuid"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.label}>Player ID</Text>
            <TextInput
              accessibilityLabel="Player ID"
              value={joinPlayerId}
              onChangeText={setJoinPlayerId}
              placeholder="1"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              style={styles.input}
            />
            <CommandButton label="Join Seat" onPress={joinSeat} disabled={busy} />
          </Section>

          <Section title="LINKED MATCH" style={wideSectionStyle}>
            <View style={styles.statusRow}>
              <Text style={styles.body}>{status}</Text>
              {busy && <ActivityIndicator color={Colors.gold} />}
            </View>
            {session && (
              <>
                <Text style={styles.meta}>Local player {session.playerId} - {formatSavedAt(session.updatedAt)}</Text>
                {session.sessionId && <Text style={styles.meta}>Session {session.sessionLabel ?? session.sessionId.slice(0, 12)}</Text>}
                <Text style={styles.meta}>Realtime {liveMode}</Text>
                <View style={styles.actions}>
                  {snapshot && (
                    <CommandButton
                      label="Open Battle Map"
                      onPress={() => router.push('/multiplayer-game' as Href)}
                      disabled={busy}
                      primary
                    />
                  )}
                  <CommandButton label="Refresh Snapshot" onPress={() => void refreshSnapshot()} disabled={busy} />
                  <CommandButton label="Clear Token" onPress={clearSession} disabled={busy} danger />
                </View>
              </>
            )}
            {snapshot && (
              <View style={styles.snapshot}>
                <Text style={styles.snapshotTitle}>Match {snapshot.id}</Text>
                <Text style={styles.meta}>Version {snapshot.version} - turn {snapshot.state.turn} - {snapshot.state.phase}</Text>
                <Text style={styles.meta}>Seat {snapshot.you ?? 'observer'} - {aliveNames.join(', ')}</Text>
                <View style={styles.seatList}>
                  {snapshot.seats.map((seat) => (
                    <Text key={seat.playerId} style={styles.seat}>
                      P{seat.playerId}: {seat.playerName} - {seat.claimed ? seat.sessionLabel ?? 'claimed' : 'open'}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </Section>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ImageBackground
      source={PARCHMENT_PANEL_TEXTURE}
      style={[styles.section, style]}
      imageStyle={styles.sectionTexture}
      resizeMode="cover"
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </ImageBackground>
  );
}

function StatusPill({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'gold' | 'crimson' | 'muted';
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === 'gold' && styles.statusPillGold,
        tone === 'crimson' && styles.statusPillCrimson,
      ]}
    >
      <Text
        style={[
          styles.statusPillText,
          tone === 'gold' && styles.statusPillTextGold,
          tone === 'crimson' && styles.statusPillTextCrimson,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

function CommandButton({
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[styles.buttonText, primary && styles.buttonTextPrimary, danger && styles.buttonTextDanger]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, overflow: 'hidden' },
  tableTexture: { opacity: 0.94 },
  tableShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,5,2,0.28)',
  },
  safe: { flex: 1 },
  header: {
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 14,
  },
  backBtn: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.32)',
    backgroundColor: 'rgba(21,13,9,0.38)',
    paddingHorizontal: 12,
  },
  backText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_600SemiBold', fontSize: 13 },
  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  titleTextBlock: { gap: 3, flexShrink: 1 },
  title: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'IMFellEnglishSC_400Regular', fontSize: 17, letterSpacing: 3 },
  subtitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12 },
  statusCluster: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: 360 },
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201,183,146,0.34)',
    backgroundColor: 'rgba(21,13,9,0.38)',
    paddingHorizontal: 8,
  },
  statusPillGold: { borderColor: 'rgba(222,190,115,0.64)', backgroundColor: 'rgba(79,57,24,0.34)' },
  statusPillCrimson: { borderColor: 'rgba(157,37,41,0.7)', backgroundColor: 'rgba(80,15,18,0.36)' },
  statusPillText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_700Bold', fontSize: 10, letterSpacing: 1 },
  statusPillTextGold: { color: Colors.gold },
  statusPillTextCrimson: { color: Colors.textCrimson },
  divider: { alignSelf: 'center', width: '100%', height: 1, backgroundColor: 'rgba(222,190,115,0.24)' },
  content: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
  },
  section: {
    gap: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.34)',
    backgroundColor: 'rgba(21,13,9,0.74)',
    padding: 14,
  },
  sectionTexture: { opacity: 0.18 },
  sectionTitle: {
    ...MAP_HUD_TEXT_SHADOW,
    color: Colors.goldDim, fontFamily: 'Alegreya_600SemiBold', fontSize: 11,
    letterSpacing: 3, textTransform: 'uppercase',
  },
  sectionContent: { gap: 10 },
  label: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_500Medium', fontSize: 12 },
  body: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 14, lineHeight: 20 },
  meta: { ...MAP_HUD_TEXT_SHADOW, color: Colors.textMuted, fontFamily: 'Alegreya_400Regular', fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.26)',
    backgroundColor: 'rgba(8,5,2,0.50)',
    color: Colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Alegreya_500Medium',
    fontSize: 14,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.34)',
    backgroundColor: 'rgba(21,13,9,0.56)',
    paddingHorizontal: 14,
  },
  buttonPrimary: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  buttonDanger: { borderColor: Colors.crimson },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 13, letterSpacing: 1 },
  buttonTextPrimary: { color: Colors.bg },
  buttonTextDanger: { color: Colors.crimson },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterButton: {
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.28)',
    backgroundColor: 'rgba(21,13,9,0.48)',
    paddingHorizontal: 10,
  },
  filterButtonActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterText: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_700Bold', fontSize: 12 },
  filterTextActive: { color: Colors.bg },
  snapshot: {
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.28)',
    backgroundColor: 'rgba(8,5,2,0.42)',
    padding: 12,
  },
  lobbyRow: {
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(222,190,115,0.28)',
    backgroundColor: 'rgba(8,5,2,0.42)',
    padding: 12,
  },
  lobbyTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 13 },
  snapshotTitle: { ...MAP_HUD_TEXT_SHADOW, color: Colors.gold, fontFamily: 'Alegreya_700Bold', fontSize: 14 },
  seatList: { gap: 4, marginTop: 4 },
  seat: { ...MAP_HUD_TEXT_SHADOW, color: Colors.text, fontFamily: 'Alegreya_400Regular', fontSize: 12 },
});
