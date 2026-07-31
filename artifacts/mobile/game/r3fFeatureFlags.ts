export const R3F_FEATURE_FLAG_ENV = {
  battleInstancing: "EXPO_PUBLIC_R3F_BATTLE_INSTANCING",
  conquestPulse: "EXPO_PUBLIC_R3F_CONQUEST_PULSE",
  orderReveal: "EXPO_PUBLIC_R3F_ORDER_REVEAL",
  stylizedWater: "EXPO_PUBLIC_R3F_STYLIZED_WATER",
  qualification: "EXPO_PUBLIC_R3F_QUALIFICATION",
} as const;

export interface R3FFeatureFlags {
  battleInstancing: boolean;
  conquestPulse: boolean;
  orderReveal: boolean;
  stylizedWater: boolean;
  qualification: boolean;
}

type FeatureFlagEnv = Record<string, string | undefined>;

function envFlag(
  env: FeatureFlagEnv,
  name: string,
  defaultValue: boolean,
): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return defaultValue;
}

export function resolveR3FFeatureFlags(
  env: FeatureFlagEnv = process.env,
): R3FFeatureFlags {
  return {
    battleInstancing: envFlag(
      env,
      R3F_FEATURE_FLAG_ENV.battleInstancing,
      true,
    ),
    conquestPulse: envFlag(env, R3F_FEATURE_FLAG_ENV.conquestPulse, false),
    orderReveal: envFlag(env, R3F_FEATURE_FLAG_ENV.orderReveal, false),
    stylizedWater: envFlag(env, R3F_FEATURE_FLAG_ENV.stylizedWater, false),
    qualification: envFlag(env, R3F_FEATURE_FLAG_ENV.qualification, false),
  };
}

export const R3F_FEATURE_FLAGS = resolveR3FFeatureFlags();
