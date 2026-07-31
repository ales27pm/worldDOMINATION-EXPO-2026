export type MultiplayerCommandStatusTone = 'gold' | 'crimson' | 'muted' | 'pending';

export interface MultiplayerCommandStatusPill {
  label: string;
  tone: MultiplayerCommandStatusTone;
}

export function multiplayerCommandStatusPills({
  apiReady,
  hasAuthToken,
  linked,
  version,
  busy,
  liveMode,
  invitationLiveMode,
}: {
  apiReady: boolean;
  hasAuthToken: boolean;
  linked: boolean;
  version?: number | null;
  busy: boolean;
  liveMode: string;
  invitationLiveMode: string;
}): MultiplayerCommandStatusPill[] {
  const pills: MultiplayerCommandStatusPill[] = [
    {
      label: busy ? 'SERVER PENDING' : apiReady ? 'API ROUTE READY' : 'API ROUTE NEEDED',
      tone: busy ? 'pending' : apiReady ? 'gold' : 'crimson',
    },
    {
      label: hasAuthToken ? 'AUTH TOKEN SET' : 'NO SHARED TOKEN',
      tone: 'muted',
    },
    {
      label: linked ? `MATCH V${version ?? '-'} LINKED` : 'NO LINKED MATCH',
      tone: linked ? 'gold' : 'muted',
    },
  ];

  if (linked) {
    pills.push({
      label: `REALTIME ${modeLabel(liveMode)}`,
      tone: liveMode === 'off' ? 'muted' : 'gold',
    });
  }

  if (invitationLiveMode !== 'off') {
    pills.push({
      label: `INVITES ${modeLabel(invitationLiveMode)}`,
      tone: 'gold',
    });
  }

  return pills;
}

function modeLabel(mode: string): string {
  const normalized = mode.trim();
  return normalized ? normalized.replace(/\s+/g, ' ').toUpperCase() : 'OFF';
}
