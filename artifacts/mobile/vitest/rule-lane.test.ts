import { describe, expect, it } from 'vitest';

import { battlePresentationSummary } from '../game/battlePresentation';
import { tierForAttacker, tierForDefender } from '../game/dice';
import { campaignEventFeedSnapshot } from '../game/eventFeed';
import { activeTerritories } from '../game/mapData';
import type { BattleReport, LogEntry } from '../game/types';

describe('Vitest rule lane', () => {
  it('runs portable pure-rule and presentation checks without Expo runtime', () => {
    expect(tierForAttacker(19)).toBe('black');
    expect(tierForDefender(18)).toBe('orange');
    expect(activeTerritories(false)).toHaveLength(42);
    expect(activeTerritories(true)).toHaveLength(48);
  });

  it('reads battle and event presentation helpers through the Vite resolver', () => {
    const battle: BattleReport = {
      from: 'alaska',
      to: 'northwestTerritory',
      attacker: 0,
      defender: 1,
      attackerRolls: [6, 5, 4],
      defenderRolls: [3, 2],
      attackerLosses: 0,
      defenderLosses: 1,
      rounds: 1,
      conquered: true,
      attackerTier: 'classicAttack',
      defenderTier: 'classicDefend',
      attackerArmiesBefore: 5,
      defenderArmiesBefore: 1,
    };
    const events: LogEntry[] = [
      { id: 3, turn: 3, text: 'New turn', tone: 'gold' },
      { id: 2, turn: 2, text: 'Battle', tone: 'battle' },
      { id: 1, turn: 1, text: 'Muster', tone: 'info' },
    ];

    expect(battlePresentationSummary(battle)?.outlook).toBe('attacker');
    expect(campaignEventFeedSnapshot(events, 2).displayEvents.map((entry) => entry.id)).toEqual([2, 3]);
  });
});
