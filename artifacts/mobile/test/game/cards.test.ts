import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import { findBestSet, isValidSet, setTradeValue, tradeBonus, tradeValue } from "../../game/cards";
import type { RiskCard } from "../../game/types";

const card = (id: string, type: RiskCard["type"], territory: RiskCard["territory"] = null): RiskCard => ({
  id,
  type,
  territory,
});

test("card set validation accepts triplets, mixed sets, and wild-assisted sets", () => {
  ok(isValidSet([card("i1", "infantry"), card("i2", "infantry"), card("i3", "infantry")]));
  ok(isValidSet([card("i", "infantry"), card("c", "cavalry"), card("a", "artillery")]));
  ok(isValidSet([card("i", "infantry"), card("c", "cavalry"), card("w", "wild")]));

  equal(isValidSet([card("i", "infantry"), card("c1", "cavalry"), card("c2", "cavalry")]), false);
  equal(isValidSet([card("i", "infantry"), card("w", "wild")]), false);
});

test("trade bonuses follow the restored RISK II rule variants", () => {
  deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((completed) => tradeBonus(completed)), [4, 6, 8, 10, 12, 15, 20, 25]);
  equal(tradeValue([card("i1", "infantry"), card("i2", "infantry"), card("i3", "infantry")], "ascending", 2), 8);
  equal(tradeValue([card("i1", "infantry"), card("i2", "infantry"), card("i3", "infantry")], "ascendingByOne", 2), 6);
  equal(tradeValue([card("i", "infantry"), card("c", "cavalry"), card("a", "artillery")], "setValue", 0), 10);
});

test("set-value wilds resolve to the highest legal payout", () => {
  equal(setTradeValue([card("i", "infantry"), card("w1", "wild"), card("w2", "wild")]), 10);
  equal(setTradeValue([card("a1", "artillery"), card("a2", "artillery"), card("w", "wild")]), 8);
  equal(setTradeValue([card("i", "infantry"), card("c", "cavalry"), card("w", "wild")]), 10);
});

test("best-set search prefers keeping wilds when a non-wild set is available", () => {
  const hand = [
    card("i", "infantry"),
    card("c", "cavalry"),
    card("a", "artillery"),
    card("w", "wild"),
  ];

  deepEqual(findBestSet(hand, "ascending")?.map((c) => c.id), ["i", "c", "a"]);
});
