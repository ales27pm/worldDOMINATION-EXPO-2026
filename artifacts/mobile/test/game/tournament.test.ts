import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  buildTournamentSetup,
  TOURNAMENT_GAMES,
  TOURNAMENT_LENGTH,
  tournamentCampaignSummary,
} from "../../game/tournament";

test("tournament campaign summaries expose ledger metadata", () => {
  equal(TOURNAMENT_LENGTH, 16);

  deepEqual(tournamentCampaignSummary(TOURNAMENT_GAMES[0]), {
    objectiveName: "60% Domination",
    allocationName: "Random Allocation",
    opponentCount: 2,
    territoryCount: 42,
    difficulty: 1,
    difficultyMarks: "★",
    maxPoints: 220,
  });

  deepEqual(tournamentCampaignSummary(TOURNAMENT_GAMES[15]), {
    objectiveName: "World Domination",
    allocationName: "Election",
    opponentCount: 7,
    territoryCount: 48,
    difficulty: 4,
    difficultyMarks: "★★★★",
    maxPoints: 320,
  });
});

test("tournament setup preserves campaign rules and commander fallback", () => {
  const setup = buildTournamentSetup(TOURNAMENT_GAMES[15], "  ");

  equal(setup.players.length, 8);
  equal(setup.players[0].name, "You");
  equal(setup.players[0].isHuman, true);
  equal(setup.objective, "domination100");
  equal(setup.cardRule, "ascending");
  equal(setup.allocation, "election");
  equal(setup.useExtraTerritories, true);
  equal(setup.tournamentGame, 16);
  deepEqual(
    setup.players.slice(1).map((player) => player.generalId),
    ["wellington", "bonaparte", "baird", "vauban", "taupin", "marmont", "mackenzie"],
  );
});
