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
  const qualification = envFlag(env, R3F_FEATURE_FLAG_ENV.qualification, false);
  return {
    battleInstancing: envFlag(env, R3F_FEATURE_FLAG_ENV.battleInstancing, true),
    conquestPulse: envFlag(
      env,
      R3F_FEATURE_FLAG_ENV.conquestPulse,
      qualification,
    ),
    orderReveal: envFlag(env, R3F_FEATURE_FLAG_ENV.orderReveal, qualification),
    stylizedWater: envFlag(env, R3F_FEATURE_FLAG_ENV.stylizedWater, false),
    qualification,
  };
}

const R3F_BUILD_ENV: FeatureFlagEnv = {
  [R3F_FEATURE_FLAG_ENV.battleInstancing]:
    process.env.EXPO_PUBLIC_R3F_BATTLE_INSTANCING,
  [R3F_FEATURE_FLAG_ENV.conquestPulse]:
    process.env.EXPO_PUBLIC_R3F_CONQUEST_PULSE,
  [R3F_FEATURE_FLAG_ENV.orderReveal]: process.env.EXPO_PUBLIC_R3F_ORDER_REVEAL,
  [R3F_FEATURE_FLAG_ENV.stylizedWater]:
    process.env.EXPO_PUBLIC_R3F_STYLIZED_WATER,
  [R3F_FEATURE_FLAG_ENV.qualification]:
    process.env.EXPO_PUBLIC_R3F_QUALIFICATION,
};

export const R3F_FEATURE_FLAGS = resolveR3FFeatureFlags(R3F_BUILD_ENV);
