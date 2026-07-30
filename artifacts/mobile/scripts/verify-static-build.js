const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const staticBuild = path.join(projectRoot, 'static-build');
const platforms = ['android', 'ios'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  assert(fs.existsSync(filePath), `Missing JSON file: ${path.relative(projectRoot, filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(filePath));
    else files.push(filePath);
  }
  return files;
}

function assertFile(filePath, label) {
  assert(fs.existsSync(filePath), `${label} missing: ${path.relative(projectRoot, filePath)}`);
  const stat = fs.statSync(filePath);
  assert(stat.size > 0, `${label} is empty: ${path.relative(projectRoot, filePath)}`);
}

function findPlatformBundle(platform) {
  const suffix = path.join('_expo', 'static', 'js', platform, 'bundle.js');
  const bundles = walk(staticBuild).filter((file) => file.endsWith(suffix));
  assert(
    bundles.length === 1,
    `expected exactly one ${platform} launch bundle, found ${bundles.length}`,
  );
  assertFile(bundles[0], `${platform} launch bundle`);
  return bundles[0];
}

function verifyLaunchManifest(platform) {
  const manifestPath = path.join(staticBuild, platform, 'manifest.json');
  const manifest = readJson(manifestPath);
  assert(manifest && typeof manifest === 'object', `${platform} manifest is not an object`);
  assert(manifest.launchAsset?.url, `${platform} manifest missing launchAsset.url`);
  assert(manifest.launchAsset?.key, `${platform} manifest missing launchAsset.key`);
  assert(manifest.extra?.expoClient, `${platform} manifest missing extra.expoClient`);

  const bundlePath = findPlatformBundle(platform);
  const bundleRelative = path.relative(staticBuild, bundlePath).split(path.sep).join('/');
  assert(
    manifest.launchAsset.url.endsWith(bundleRelative),
    `${platform} launchAsset.url does not point at local launch bundle ${bundleRelative}`,
  );

  const bundle = fs.readFileSync(bundlePath, 'utf8');
  for (const snippet of ['WORLD', 'DOMINATION', 'Same Time RISK', 'WORLD_BOARD']) {
    assert(bundle.includes(snippet), `${platform} launch bundle missing "${snippet}"`);
  }

  return {
    launchAsset: manifest.launchAsset.url,
    bundle: path.relative(projectRoot, bundlePath),
  };
}

function verifyBundledAssets() {
  const files = walk(staticBuild);
  const worldMapAssets = files.filter((file) => /assets\/game\/world-map(?:\.[^.]+)?\.webp$/.test(file));
  assert(worldMapAssets.length === 1, `expected one world-map asset, found ${worldMapAssets.length}`);
  assertFile(worldMapAssets[0], 'world map asset');

  const pieceAssets = files.filter((file) =>
    /assets\/game\/pieces\/piece-(infantry|cavalry|artillery)(?:\.[^.]+)?\.png$/.test(file),
  );
  assert(pieceAssets.length === 3, `expected three piece assets, found ${pieceAssets.length}`);
  for (const file of pieceAssets) assertFile(file, 'piece asset');

  const battleViews = files.filter((file) => /assets\/game\/battle-views\/[^/]+(?:\.[^.]+)?\.webp$/.test(file));
  assert(battleViews.length >= 42, `expected at least 42 battle-view assets, found ${battleViews.length}`);

  return {
    totalFiles: files.length,
    worldMapAssets: worldMapAssets.length,
    pieceAssets: pieceAssets.length,
    battleViews: battleViews.length,
  };
}

function main() {
  assert(fs.existsSync(staticBuild), 'static-build does not exist. Run pnpm build first.');
  for (const platform of platforms) {
    const result = verifyLaunchManifest(platform);
    console.log(`${platform}: launchAsset=ok bundle=${result.bundle}`);
  }
  const assets = verifyBundledAssets();
  console.log(
    `assets: files=${assets.totalFiles} worldMap=${assets.worldMapAssets} pieces=${assets.pieceAssets} battleViews=${assets.battleViews}`,
  );
}

main();
