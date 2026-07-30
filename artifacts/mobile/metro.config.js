const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const threeEntry = require.resolve("three");

config.resolver.assetExts = [...config.resolver.assetExts, "glb"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") {
    return {
      type: "sourceFile",
      filePath: threeEntry,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
