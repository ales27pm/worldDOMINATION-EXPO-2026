import type { Allocation, CardRule, Objective, TurnStyle } from "./types";

export interface SetupOption<T extends string> {
  value: T;
  label: string;
  desc: string;
  tableCue: string;
}

export const OBJECTIVE_OPTIONS: SetupOption<Objective>[] = [
  {
    value: "domination60",
    label: "60% Domination",
    desc: "Win by holding a decisive majority of the active map.",
    tableCue: "Fast campaign pressure without requiring a final cleanup.",
  },
  {
    value: "domination80",
    label: "80% Domination",
    desc: "Win by controlling four fifths of the theater.",
    tableCue: "Longer front management with room for late coalitions.",
  },
  {
    value: "domination100",
    label: "World Domination",
    desc: "Win only after conquering every active territory.",
    tableCue: "Classic total-war finish.",
  },
  {
    value: "capital",
    label: "Capital RISK",
    desc: "Win by capturing enemy capital cities.",
    tableCue: "Capitals turn the map into visible strategic objectives.",
  },
  {
    value: "mission",
    label: "Secret Mission",
    desc: "Win by completing a hidden commander objective.",
    tableCue: "Private orders make bluffing and handoff privacy matter.",
  },
];

export const ALLOCATION_OPTIONS: SetupOption<Allocation>[] = [
  {
    value: "random",
    label: "Random Deal",
    desc: "Territories are dealt before the first deployment.",
    tableCue: "Immediate campaign start with uneven borders to solve.",
  },
  {
    value: "grab",
    label: "Territory Grab",
    desc: "Commanders claim open territories from the map.",
    tableCue: "Every selectable unclaimed region is a deliberate opening move.",
  },
  {
    value: "election",
    label: "Elections",
    desc: "Territories are auctioned with election points.",
    tableCue: "A slower political opening where passes, budgets and bids matter.",
  },
];

export const CARD_RULE_OPTIONS: SetupOption<CardRule>[] = [
  {
    value: "ascending",
    label: "Ascending (classic)",
    desc: "Trade sets for the classic escalating army schedule.",
    tableCue: "Readable pressure curve and familiar RISK II timing.",
  },
  {
    value: "ascendingByOne",
    label: "Ascending +1",
    desc: "Each later trade rises by one army.",
    tableCue: "Restrained economy for longer fronts.",
  },
  {
    value: "setValue",
    label: "Set Value",
    desc: "Every valid set has a fixed value.",
    tableCue: "Stable card value, fewer late-game surges.",
  },
];

export const TURN_STYLE_OPTIONS: SetupOption<TurnStyle>[] = [
  {
    value: "classic",
    label: "Classic RISK",
    desc: "One commander completes reinforcement, attack and fortification before handoff.",
    tableCue: "Open deployments, red dice selection, occupation and one tactical march.",
  },
  {
    value: "sameTime",
    label: "Same Time RISK",
    desc: "Every commander stages and seals orders before simultaneous resolution.",
    tableCue:
      "Secret reinforcement, committed attack orders, dice tiers, playback acknowledgement and tactical movement.",
  },
];

export interface MapSetupBriefing {
  label: string;
  desc: string;
  tableCue: string;
  territoryCount: number;
}

export function mapSetupBriefing(useExtraTerritories: boolean): MapSetupBriefing {
  if (useExtraTerritories) {
    return {
      label: "Extended Map",
      desc: "The 48-territory theater adds Hawaii, Svalbard, Falklands, West Africa, Philippines and New Zealand.",
      tableCue: "More sea routes and flanking pressure while preserving Classic territory ids.",
      territoryCount: 48,
    };
  }

  return {
    label: "Classic Map",
    desc: "The 42-territory board keeps the standard RISK II theater.",
    tableCue: "Familiar continent bonuses, routes and hit targets.",
    territoryCount: 42,
  };
}

export function optionByValue<T extends string>(
  options: readonly SetupOption<T>[],
  value: T,
): SetupOption<T> {
  return options.find((option) => option.value === value) ?? options[0];
}

export function setupBriefingLines({
  objective,
  allocation,
  cardRule,
  turnStyle,
  useExtraTerritories,
  restrictedReinforcement,
}: {
  objective: Objective;
  allocation: Allocation;
  cardRule: CardRule;
  turnStyle: TurnStyle;
  useExtraTerritories: boolean;
  restrictedReinforcement: boolean;
}): string[] {
  const map = mapSetupBriefing(useExtraTerritories);
  const turn = optionByValue(TURN_STYLE_OPTIONS, turnStyle);
  const lines = [
    `${map.territoryCount} territories: ${map.desc}`,
    `${turn.label}: ${turn.tableCue}`,
    `${optionByValue(ALLOCATION_OPTIONS, allocation).label}: ${optionByValue(ALLOCATION_OPTIONS, allocation).desc}`,
    `${optionByValue(CARD_RULE_OPTIONS, cardRule).label}: ${optionByValue(CARD_RULE_OPTIONS, cardRule).desc}`,
    `${optionByValue(OBJECTIVE_OPTIONS, objective).label}: ${optionByValue(OBJECTIVE_OPTIONS, objective).desc}`,
  ];

  if (turnStyle === "sameTime") {
    lines.push(
      restrictedReinforcement
        ? "Restricted reinforcement is on: each territory has a per-round placement cap."
        : "Restricted reinforcement is off: commanders may mass their secret reinforcements.",
    );
  }

  return lines;
}
