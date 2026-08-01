const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const buildDir = path.join(projectRoot, ".browser-build");
const VIEWPORTS = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
  desktop: { width: 1280, height: 720 },
};

function run(command, args, env = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function expoBin() {
  const bin = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "expo.cmd" : "expo",
  );
  if (!fs.existsSync(bin)) {
    throw new Error(
      "Expo CLI not found. Run pnpm install before browser smoke tests.",
    );
  }
  return bin;
}

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(filePath));
    else files.push(filePath);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFile(filePath, label) {
  assert(
    fs.existsSync(filePath),
    `${label} missing: ${path.relative(projectRoot, filePath)}`,
  );
  const stat = fs.statSync(filePath);
  assert(
    stat.size > 0,
    `${label} is empty: ${path.relative(projectRoot, filePath)}`,
  );
}

function assertIncludes(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing "${needle}"`);
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".ttf":
      return "font/ttf";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

function findWebEntry(indexHtml) {
  const match = indexHtml.match(
    /<script[^>]+src="([^"]*\/_expo\/static\/js\/web\/[^"]+\.js)"/,
  );
  assert(match, "index.html does not reference a web JS entry bundle");
  const src = match[1].replace(/^\//, "");
  return path.join(buildDir, src);
}

function assertExportShape() {
  const indexPath = path.join(buildDir, "index.html");
  const metadataPath = path.join(buildDir, "metadata.json");
  assertFile(indexPath, "web index");
  assertFile(metadataPath, "web metadata");

  const indexHtml = fs.readFileSync(indexPath, "utf8");
  assertIncludes(indexHtml, '<div id="root"></div>', "web index");
  assertIncludes(indexHtml, "<title>worldDOMINATION</title>", "web index");

  const entryPath = findWebEntry(indexHtml);
  assertFile(entryPath, "web entry bundle");
  const bundle = fs.readFileSync(entryPath, "utf8");

  // These strings prove the exported browser bundle contains the menu, setup
  // mode switcher, smoke-game seed, and native map presentation modules.
  for (const snippet of [
    "WORLD",
    "DOMINATION",
    "Classic RISK",
    "Same Time RISK",
    "Extended Map",
    "COMMAND DISPATCH",
    "Open muster",
    "Sealed attacks",
    "I. MUSTER",
    "II. SEAL",
    "HALL OF RECORDS",
    "Tournament High Scores",
    "MULTIPLAYER COMMAND",
    "Server-authoritative Same Time command board",
    "API ROUTE READY",
    "Quick Match",
    "Create Host Seat",
    "Joinable",
    "Refresh Lobby",
    "PENDING INVITATIONS",
    "Refresh Invitations",
    "Watch Invitations",
    "CONTACTS",
    "Refresh Contacts",
    "INVITE SEAT",
    "Trusted User ID",
    "Open Battle Map",
    "MULTIPLAYER BATTLEFIELD",
    "OUTLOOK",
    "Attacker edge",
    "No dispatches yet.",
    "Campaign Statistics",
    "Capital cities seized",
    "REINFORCE (SIM)",
    "Napoleon",
    "Wellington",
    "WORLD_BOARD",
    "North America",
    "Alaska",
    "assets/game/world-map",
  ]) {
    assertIncludes(bundle, snippet, "web entry bundle");
  }

  const files = walk(buildDir);
  const worldMapAssets = files.filter((file) =>
    /assets\/game\/world-map\.[^.]+\.webp$/.test(file),
  );
  assert(
    worldMapAssets.length === 1,
    `expected exactly one bundled world map asset, found ${worldMapAssets.length}`,
  );
  assertFile(worldMapAssets[0], "bundled world map");

  const mapGlbs = files.filter((file) =>
    /assets\/game\/map-3d\/world-map-(classic|expanded)\.[^.]+\.glb$/.test(
      file,
    ),
  );
  assert(
    mapGlbs.length === 2,
    `expected two canonical map GLBs, found ${mapGlbs.length}`,
  );
  for (const file of mapGlbs) assertFile(file, "bundled canonical map GLB");

  const territoryLabelAtlases = files.filter((file) =>
    /assets\/game\/map-3d\/territory-labels\.[^.]+\.png$/.test(file),
  );
  assert(
    territoryLabelAtlases.length === 1,
    `expected one bundled territory-label atlas, found ${territoryLabelAtlases.length}`,
  );
  assertFile(territoryLabelAtlases[0], "bundled territory-label atlas");

  const pieceAssets = files.filter((file) =>
    /assets\/game\/pieces\/piece-(infantry|cavalry|artillery)\.[^.]+\.png$/.test(
      file,
    ),
  );
  assert(
    pieceAssets.length === 3,
    `expected three bundled piece assets, found ${pieceAssets.length}`,
  );
  for (const file of pieceAssets) assertFile(file, "bundled piece asset");

  const commandUiAssets = files.filter((file) =>
    /assets\/ui\/(command-table-walnut|parchment-panel|imperial-command-seal)\.[^.]+\.(webp|png)$/.test(
      file,
    ),
  );
  assert(
    commandUiAssets.length === 3,
    `expected three bundled generated command UI assets, found ${commandUiAssets.length}`,
  );
  for (const file of commandUiAssets)
    assertFile(file, "bundled command UI asset");

  const battleViews = files.filter((file) =>
    /assets\/game\/battle-views\/[^/]+\.[^.]+\.webp$/.test(file),
  );
  assert(
    battleViews.length >= 42,
    `expected at least 42 bundled battle-view assets, found ${battleViews.length}`,
  );

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  assert(
    typeof metadata === "object" && metadata !== null,
    "metadata.json is not valid object JSON",
  );

  console.log(`ok - Expo web export produced ${files.length} files`);
  console.log(`ok - web entry bundle ${path.relative(projectRoot, entryPath)}`);
  console.log(`ok - bundled map/piece/battle-view assets are present`);
}

function startStaticServer() {
  const indexPath = path.join(buildDir, "index.html");
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const candidate = path.resolve(buildDir, rel || "index.html");
    const filePath =
      candidate.startsWith(buildDir) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
        ? candidate
        : indexPath;

    res.writeHead(200, { "content-type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("browser smoke server did not return a TCP address"));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function findBrowserExecutable() {
  try {
    const { chromium } = require("playwright");
    const playwrightChrome = chromium.executablePath();
    if (fs.existsSync(playwrightChrome)) return playwrightChrome;
  } catch {
    // Fall through to a system browser.
  }

  const candidates = [
    process.env.BROWSER_SMOKE_CHROME,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const systemChrome = candidates.find((candidate) => fs.existsSync(candidate));
  if (systemChrome) return systemChrome;

  try {
    const puppeteer = require("puppeteer");
    const puppeteerChrome = await puppeteer.executablePath();
    if (fs.existsSync(puppeteerChrome)) return puppeteerChrome;
  } catch {
    // The final assertion reports the missing browser with setup guidance.
  }

  return undefined;
}

async function assertRenderedRoute(page, url, snippets, label) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page
    .waitForLoadState("networkidle", { timeout: 30000 })
    .catch(() => {});
  await page.waitForTimeout(750);
  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  for (const snippet of snippets) assertIncludes(bodyText, snippet, label);
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  const maxScrollWidth = Math.max(
    metrics.bodyScrollWidth,
    metrics.documentScrollWidth,
  );
  assert(
    maxScrollWidth <= metrics.viewportWidth + 2,
    `${label} overflowed horizontally: ${maxScrollWidth}px content in ${metrics.viewportWidth}px viewport`,
  );
}

async function assertTextWithinViewport(page, text, label) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await page.waitForFunction(
    (needle) => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const elements = Array.from(document.querySelectorAll("body *"));
      for (const element of elements) {
        if (!element.textContent?.includes(needle)) continue;
        const style = window.getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const box = element.getBoundingClientRect();
        if (
          box.width > 0 &&
          box.height > 0 &&
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= viewportWidth + 1 &&
          box.bottom <= viewportHeight + 1
        ) {
          return {
            x: box.left,
            y: box.top,
            width: box.width,
            height: box.height,
          };
        }
      }
      return false;
    },
    text,
    { timeout: 10000 },
  );
  const viewport = page.viewportSize();
  const visibleBox = await box.jsonValue();
  assert(visibleBox, `${label} missing visible text "${text}"`);
  assert(viewport, `${label} missing viewport size while checking "${text}"`);
  assert(
    visibleBox.x >= -1 &&
      visibleBox.y >= -1 &&
      visibleBox.x + visibleBox.width <= viewport.width + 1 &&
      visibleBox.y + visibleBox.height <= viewport.height + 1,
    `${label} text "${text}" is outside the viewport`,
  );
}

async function assertLabeledControl(page, label, screenLabel) {
  const locator = page.getByLabel(label).first();
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const box = await locator.boundingBox();
  assert(
    box && box.width > 0 && box.height > 0,
    `${screenLabel} missing labeled control "${label}"`,
  );
  return locator;
}

async function assertMinTouchTarget(locator, minSize, label) {
  const box = await locator.boundingBox();
  assert(
    box && box.width >= minSize && box.height >= minSize,
    `${label} was smaller than ${minSize}px: ${box ? `${box.width}x${box.height}` : "missing box"}`,
  );
}

async function assertBackgroundAlpha(locator, expected, label) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  const color = await locator.evaluate(
    (element) => window.getComputedStyle(element).backgroundColor,
  );
  const match = color.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
  const alpha =
    color === "transparent"
      ? 0
      : match
        ? match[1] === undefined
          ? 1
          : Number(match[1])
        : NaN;
  assert(
    Number.isFinite(alpha),
    `${label} returned an unreadable background color: ${color}`,
  );
  assert(
    Math.abs(alpha - expected) <= 0.011,
    `${label} expected background alpha ${expected}, received ${alpha} (${color})`,
  );
}

async function assertTransparentMapChrome(page, label) {
  await assertBackgroundAlpha(
    page.getByTestId("map-top-bar"),
    0.12,
    `${label} top bar`,
  );
  await assertBackgroundAlpha(
    page.getByTestId("map-command-panel"),
    0.12,
    `${label} command panel`,
  );
  await assertBackgroundAlpha(
    page.getByTestId("map-continent-legend"),
    0.12,
    `${label} continent legend`,
  );
  await assertBackgroundAlpha(
    page.getByTestId("map-event-ticker"),
    0.12,
    `${label} event ticker`,
  );
  await assertBackgroundAlpha(
    page.getByTestId("map-view-mode-button"),
    0.22,
    `${label} view-mode control`,
  );
  await assertBackgroundAlpha(
    page.getByLabel("Focus action"),
    0.22,
    `${label} focus control`,
  );
  await assertMinTouchTarget(
    page.getByTestId("map-renderer-toggle"),
    44,
    `${label} renderer control`,
  );
  await assertMinTouchTarget(
    page.getByTestId("map-view-mode-button"),
    44,
    `${label} view-mode control`,
  );
  await assertMinTouchTarget(
    page.getByTestId("map-battle-scene-pacing"),
    44,
    `${label} battle pacing control`,
  );
}

async function assertLandscapeCommandPanelUsesEdgeRail(page, label) {
  const panel = page.getByTestId("map-command-panel");
  const mapArea = page.getByTestId("map-play-area");
  await panel.waitFor({ state: "visible", timeout: 10000 });
  await mapArea.waitFor({ state: "visible", timeout: 10000 });
  const box = await panel.boundingBox();
  const mapBox = await mapArea.boundingBox();
  const viewport = page.viewportSize();
  assert(
    box && mapBox && viewport,
    `${label} command panel or map lane was not measurable`,
  );
  assert(
    box.x + box.width >= viewport.width - 8,
    `${label} command panel was not docked to the right edge: x=${box.x}, width=${box.width}, viewport=${viewport.width}`,
  );
  assert(
    box.width <= viewport.width * 0.38,
    `${label} command panel consumed too much map width: ${box.width}`,
  );
  assert(
    box.x >= viewport.width * 0.58,
    `${label} command panel still covered the center map: x=${box.x}, viewport=${viewport.width}`,
  );
  assert(
    mapBox.x <= 1 && mapBox.x + mapBox.width <= box.x + 2,
    `${label} map lane continued underneath the command rail: mapRight=${mapBox.x + mapBox.width}, panelLeft=${box.x}`,
  );
  assert(
    mapBox.width >= viewport.width * 0.56,
    `${label} map lane became too narrow: mapWidth=${mapBox.width}, viewport=${viewport.width}`,
  );
}

async function cameraTransform(page) {
  return page.getByTestId("map-board-transform").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(
      window.getComputedStyle(element).transform,
    );
    return {
      scale: Math.hypot(matrix.a, matrix.b),
      translateX: matrix.e,
      translateY: matrix.f,
    };
  });
}

async function assertCameraInteraction(page, label) {
  const before = await cameraTransform(page);
  await page.getByLabel("Zoom in").click({ timeout: 10000 });
  await page.waitForFunction(
    ({ expected }) => {
      const element = document.querySelector(
        '[data-testid="map-board-transform"]',
      );
      if (!element) return false;
      const matrix = new DOMMatrixReadOnly(
        window.getComputedStyle(element).transform,
      );
      return Math.hypot(matrix.a, matrix.b) > expected * 1.2;
    },
    { expected: before.scale },
    { timeout: 10000 },
  );
  const zoomed = await cameraTransform(page);
  assert(
    zoomed.scale > before.scale * 1.2,
    `${label} zoom-in control did not enlarge the board`,
  );

  await page.getByLabel("Zoom out").click({ timeout: 10000 });
  await page.waitForFunction(
    ({ expected }) => {
      const element = document.querySelector(
        '[data-testid="map-board-transform"]',
      );
      if (!element) return false;
      const matrix = new DOMMatrixReadOnly(
        window.getComputedStyle(element).transform,
      );
      return Math.hypot(matrix.a, matrix.b) <= expected * 1.03;
    },
    { expected: before.scale },
    { timeout: 10000 },
  );
  const restored = await cameraTransform(page);
  assert(
    Math.abs(restored.scale - before.scale) <= before.scale * 0.03,
    `${label} inverse zoom controls did not restore the camera scale`,
  );
}

async function assertR3FCanvasPixels(page, label) {
  const canvas = page.getByTestId("map-3d-canvas");
  await canvas.waitFor({ state: "visible", timeout: 30000 });
  const png = await canvas.screenshot();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  const stats = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const width = Math.min(320, image.width);
    const height = Math.max(
      1,
      Math.round((image.height / image.width) * width),
    );
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let opaque = 0;
    let luminanceSum = 0;
    let luminanceSquaredSum = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha > 0) opaque += 1;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminanceSum += luminance;
      luminanceSquaredSum += luminance * luminance;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    const count = pixels.length / 4;
    const mean = luminanceSum / count;
    return {
      opaqueRatio: opaque / count,
      colorBuckets: colors.size,
      luminanceVariance: luminanceSquaredSum / count - mean * mean,
    };
  }, dataUrl);

  assert(stats, `${label} could not sample the WebGL screenshot`);
  assert(stats.opaqueRatio > 0.99, `${label} was mostly transparent`);
  assert(
    stats.colorBuckets > 120,
    `${label} had too few rendered color buckets: ${stats.colorBuckets}`,
  );
  assert(
    stats.luminanceVariance > 250,
    `${label} looked blank or flat: luminance variance ${stats.luminanceVariance}`,
  );
}

async function assertDefaultR3FRenderer(page) {
  await page.waitForFunction(
    () => {
      const scene = globalThis.__WORLD_DOMINATION_R3F__;
      const shared = globalThis.__WORLD_DOMINATION_MAP_SCENE__;
      return (
        scene?.ready === true &&
        scene.renderer === "r3f" &&
        scene.territoryCount === 42 &&
        scene.pickerMeshCount === 42 &&
        scene.territoryLabelCount === 42 &&
        scene.room === "imperial-command-room" &&
        scene.roomTextureSet === "imagegen-command-room-v1" &&
        scene.tableTextureSet === "imagegen-command-table-v1" &&
        shared?.rendererMode === "r3f" &&
        shared.sceneRevision === scene.sceneRevision
      );
    },
    null,
    { timeout: 30000 },
  );
  await assertR3FCanvasPixels(page, "default R3F tabletop");
}

async function assertR3FVerticalSlice(page) {
  console.log("checking - R3F scene readiness");
  await page.waitForFunction(
    () => globalThis.__WORLD_DOMINATION_R3F__?.ready === true,
    null,
    { timeout: 30000 },
  );
  console.log("ok - R3F scene readiness");
  console.log("checking - R3F frame loop");
  await page.waitForFunction(
    () => Number(globalThis.__WORLD_DOMINATION_R3F__?.fps) > 0,
    null,
    { timeout: 10000 },
  );
  console.log("ok - R3F frame loop");
  const initial = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    initial.renderer === "r3f",
    "R3F preview did not retain the requested renderer",
  );
  assert(
    initial.room === "imperial-command-room",
    `R3F preview did not mount the command room: ${JSON.stringify(initial.room)}`,
  );
  assert(
    initial.roomTextureSet === "imagegen-command-room-v1",
    `R3F preview did not expose room textures: ${JSON.stringify(initial.roomTextureSet)}`,
  );
  assert(
    initial.tableTextureSet === "imagegen-command-table-v1",
    `R3F preview did not expose table textures: ${JSON.stringify(initial.tableTextureSet)}`,
  );
  assert(
    initial.variant === "classic",
    `R3F preview loaded unexpected map variant ${initial.variant}`,
  );
  assert(
    initial.territoryCount === 42,
    `R3F preview loaded ${initial.territoryCount} territories`,
  );
  assert(
    initial.pickerMeshCount === initial.territoryCount,
    `R3F picker registered ${initial.pickerMeshCount}/${initial.territoryCount} territory meshes`,
  );
  assert(
    initial.territoryLabelCount === initial.territoryCount,
    `R3F label layer registered ${initial.territoryLabelCount}/${initial.territoryCount} territory labels`,
  );
  assert(
    JSON.stringify(initial.armyModels) ===
      JSON.stringify(["infantry", "cavalry", "artillery"]),
    `R3F preview did not expose all army model classes: ${JSON.stringify(initial.armyModels)}`,
  );
  assert(
    initial.fps > 10,
    `R3F preview frame loop was not healthy: ${initial.fps} fps`,
  );
  assert(
    initial.r3fFeatureFlags?.battleInstancing === true &&
      initial.r3fFeatureFlags?.conquestPulse === true &&
      initial.r3fFeatureFlags?.orderReveal === true &&
      initial.r3fFeatureFlags?.stylizedWater === false,
    `R3F smoke feature flags were not qualification-safe: ${JSON.stringify(initial.r3fFeatureFlags)}`,
  );
  await assertR3FCanvasPixels(page, "R3F tabletop");

  const sharedR3FModel = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_MAP_SCENE__,
  );
  assert(
    sharedR3FModel?.rendererMode === "r3f" &&
      sharedR3FModel.sceneRevision === initial.sceneRevision &&
      sharedR3FModel.territoryCount === initial.territoryCount,
    `R3F did not consume the shared scene model: ${JSON.stringify(sharedR3FModel)}`,
  );
  console.log("checking - shared SVG/R3F scene model");
  await page.getByLabel("Use 2D map renderer").first().click({
    timeout: 10000,
  });
  await page.waitForFunction(
    (expectedRevision) =>
      globalThis.__WORLD_DOMINATION_MAP_SCENE__?.rendererMode === "svg" &&
      globalThis.__WORLD_DOMINATION_MAP_SCENE__?.sceneRevision ===
        expectedRevision &&
      globalThis.__WORLD_DOMINATION_R3F__?.ready === false,
    initial.sceneRevision,
    { timeout: 10000 },
  );
  const sharedSVGModel = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_MAP_SCENE__,
  );
  assert(
    sharedSVGModel.territoryCount === initial.territoryCount &&
      sharedSVGModel.variant === initial.variant,
    `SVG did not consume the shared scene model: ${JSON.stringify(sharedSVGModel)}`,
  );
  await page.getByLabel("Use 3D map renderer").first().click({
    timeout: 10000,
  });
  await page.waitForFunction(
    (expectedRevision) =>
      globalThis.__WORLD_DOMINATION_MAP_SCENE__?.rendererMode === "r3f" &&
      globalThis.__WORLD_DOMINATION_R3F__?.ready === true &&
      globalThis.__WORLD_DOMINATION_R3F__?.sceneRevision === expectedRevision,
    initial.sceneRevision,
    { timeout: 30000 },
  );
  const remounted = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    remounted.pickerMeshCount === initial.territoryCount,
    `R3F remount registered ${remounted.pickerMeshCount}/${initial.territoryCount} pick meshes`,
  );
  assert(
    remounted.territoryLabelCount === initial.territoryCount,
    `R3F remount registered ${remounted.territoryLabelCount}/${initial.territoryCount} territory labels`,
  );
  console.log("ok - shared SVG/R3F scene model");

  const initialViewWidth = remounted.camera.vw;
  await page.getByLabel("Zoom in").first().click({ timeout: 10000 });
  console.log("checking - R3F camera zoom");
  await page.waitForFunction(
    (viewWidth) =>
      globalThis.__WORLD_DOMINATION_R3F__?.camera?.vw < viewWidth * 0.8,
    initialViewWidth,
    { timeout: 10000 },
  );
  console.log("ok - R3F camera zoom");
  await page.waitForFunction(
    () =>
      globalThis.__WORLD_DOMINATION_R3F__?.frameProfile?.status ===
        "complete" &&
      globalThis.__WORLD_DOMINATION_R3F__?.frameProfile?.kind === "camera",
    null,
    { timeout: 10000 },
  );
  const cameraProfile = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__.frameProfile,
  );
  assert(
    cameraProfile.contractVersion === 1 &&
      cameraProfile.targetFps === 60 &&
      cameraProfile.sampleCount >= 3,
    `R3F camera frame profile was incomplete: ${JSON.stringify(cameraProfile)}`,
  );
  for (const field of [
    "durationMs",
    "averageFps",
    "p50FrameMs",
    "p95FrameMs",
    "p99FrameMs",
    "maxFrameMs",
    "withinBudgetRatio",
  ]) {
    assert(
      Number.isFinite(cameraProfile[field]),
      `R3F camera frame profile had invalid ${field}: ${JSON.stringify(cameraProfile)}`,
    );
  }
  console.log("ok - R3F active camera frame profile");
  await page.getByLabel("Show full board").first().click({ timeout: 10000 });
  await page.waitForFunction(
    (viewWidth) =>
      globalThis.__WORLD_DOMINATION_R3F__?.camera?.vw > viewWidth &&
      globalThis.__WORLD_DOMINATION_R3F__?.frameProfile?.status === "complete",
    initialViewWidth,
    { timeout: 10000 },
  );

  const brazil = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__.projected.brazil,
  );
  assert(
    brazil && Number.isFinite(brazil.x) && Number.isFinite(brazil.y),
    "R3F Brazil projection missing",
  );
  await page.mouse.click(brazil.x, brazil.y);
  console.log("checking - R3F Brazil raycast");
  await page.waitForFunction(
    () =>
      globalThis.__WORLD_DOMINATION_R3F__?.selectedId === "brazil" &&
      globalThis.__WORLD_DOMINATION_R3F__?.conquestPulse?.compiledEver === true,
    null,
    { timeout: 10000 },
  );
  console.log("ok - R3F Brazil raycast");
  const selected = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    selected.targetIds.includes("northAfrica"),
    "R3F Brazil selection did not target North Africa",
  );
  assert(
    selected.conquestPulse.compiledEver === true &&
      selected.pickerMeshCount === selected.territoryCount &&
      selected.pulseIds.some((id) => id.startsWith("selection:brazil:")),
    `R3F selection pulse did not compile independently of picking: ${JSON.stringify({ conquestPulse: selected.conquestPulse, pickerMeshCount: selected.pickerMeshCount, pulseIds: selected.pulseIds })}`,
  );
  assert(
    Number.isInteger(selected.rendererInfo?.calls) &&
      Number.isInteger(selected.rendererInfo?.triangles) &&
      Number.isInteger(selected.rendererInfo?.programs) &&
      Number.isInteger(selected.rendererInfo?.geometries) &&
      Number.isInteger(selected.rendererInfo?.textures),
    `R3F renderer counters were unavailable: ${JSON.stringify(selected.rendererInfo)}`,
  );
  console.log("ok - R3F conquest/attention shader and picking isolation");
  const diceThree = await assertLabeledControl(
    page,
    "Attack with 3 dice",
    "R3F attack dice control",
  );
  await assertMinTouchTarget(diceThree, 44, "R3F attack dice control");

  // The user-focus camera is still settling after Brazil. Read the live
  // projection immediately before the target click so this remains a picking
  // assertion, not a stale screen-coordinate race.
  const northAfrica = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__.projected.northAfrica,
  );
  assert(
    northAfrica &&
      Number.isFinite(northAfrica.x) &&
      Number.isFinite(northAfrica.y),
    "R3F North Africa projection missing",
  );
  await page.mouse.click(northAfrica.x, northAfrica.y);
  console.log("checking - R3F North Africa raycast");
  await page.waitForFunction(
    () => Boolean(globalThis.__WORLD_DOMINATION_R3F__?.battleId),
    null,
    { timeout: 10000 },
  );
  console.log("ok - R3F North Africa raycast");
  const attacked = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    attacked.battleActive,
    "R3F attack did not create an on-map battle effect",
  );
  const battleId = attacked.battleId;
  assert(
    attacked.canonicalBattleId === battleId,
    "R3F presentation did not match the canonical battle",
  );
  await page.waitForFunction(
    () => {
      const impact = globalThis.__WORLD_DOMINATION_R3F__?.battleImpact;
      return (
        impact?.mode === "instanced" &&
        impact.instanceMeshCount === 1 &&
        impact.instanceCount === 8 &&
        impact.fallbackMeshCount === 0
      );
    },
    null,
    { timeout: 10000 },
  );
  const battleImpact = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__.battleImpact,
  );
  assert(
    battleImpact.mode === "instanced" &&
      battleImpact.instanceMeshCount === 1 &&
      battleImpact.instanceCount === 8 &&
      battleImpact.fallbackMeshCount === 0,
    `R3F battle impact did not use one 8-instance mesh: ${JSON.stringify(battleImpact)}`,
  );
  console.log("ok - R3F instanced battle impact");
  await page.waitForTimeout(2300);
  const suspendedBattle = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    suspendedBattle.battleActive &&
      !suspendedBattle.performanceQualification?.profiles?.battle,
    "R3F battle effect or profiler advanced behind the battle scene",
  );
  await page.getByText("TAP TO ROLL").waitFor({ timeout: 10000 });
  const rollSurface = await assertLabeledControl(
    page,
    "Roll battle dice",
    "R3F battle roll surface",
  );
  await assertMinTouchTarget(rollSurface, 44, "R3F battle roll surface");
  await rollSurface.click({ timeout: 10000 });
  const retreat = page.getByLabel("Retreat from battle").last();
  const dismissBattle = page.getByLabel("Dismiss battle scene").last();
  const battleDecision = await Promise.race([
    retreat.waitFor({ state: "visible", timeout: 10000 }).then(() => "retreat"),
    dismissBattle
      .waitFor({ state: "visible", timeout: 10000 })
      .then(() => "dismiss"),
  ]);
  if (battleDecision === "retreat") {
    await assertMinTouchTarget(retreat, 44, "R3F battle retreat control");
    await retreat.click();
  } else {
    await assertMinTouchTarget(dismissBattle, 44, "R3F battle dismiss surface");
    await dismissBattle.click({ timeout: 10000 });
  }
  await page.waitForFunction(
    () =>
      globalThis.__WORLD_DOMINATION_R3F__?.battleActive === false &&
      globalThis.__WORLD_DOMINATION_R3F__?.battleId === null,
    null,
    { timeout: 5000 },
  );
  const settled = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    settled.canonicalBattleId === battleId,
    "R3F finite effect cleared the canonical battle state",
  );
  await page.waitForFunction(
    () => {
      const scene = globalThis.__WORLD_DOMINATION_R3F__;
      return (
        scene?.visualEffectsActive === false &&
        scene?.renderActivity?.cameraMotion === "idle" &&
        typeof scene?.lastCompletedPulseId === "string"
      );
    },
    null,
    { timeout: 10000 },
  );
  console.log("ok - R3F effects returned to idle");
  await page.waitForFunction(
    () => {
      const qualification =
        globalThis.__WORLD_DOMINATION_R3F__?.performanceQualification;
      return (
        qualification?.status === "ineligible" &&
        qualification.environment === "browser" &&
        qualification.missingKinds.length === 0 &&
        qualification.profiles.camera?.report.kind === "camera" &&
        qualification.profiles.battle?.report.kind === "battle"
      );
    },
    null,
    { timeout: 10000 },
  );
  const performanceQualification = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__.performanceQualification,
  );
  assert(
    performanceQualification.contractVersion === 1 &&
      performanceQualification.targetFps === 60 &&
      performanceQualification.profiles["battle-cold"]?.report.renderer
        ?.sampleCount > 0 &&
      performanceQualification.profiles["conquest-pulse"]?.report.renderer
        ?.sampleCount > 0 &&
      ["pass", "fail"].includes(performanceQualification.metricStatus),
    `R3F performance qualification was incomplete: ${JSON.stringify(performanceQualification)}`,
  );
  assert(
    performanceQualification.status === "ineligible",
    "Browser metrics incorrectly satisfied the physical-device gate",
  );
  await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem(
        "worlddomination.mapPerformanceEvidence.v1",
      );
      if (!raw) return false;
      try {
        const evidence = JSON.parse(raw);
        return (
          evidence.evidenceVersion === 1 &&
          evidence.platform === "web" &&
          evidence.scene?.variant === "classic" &&
          evidence.scene?.territoryCount === 42 &&
          evidence.qualification?.environment === "browser" &&
          evidence.qualification?.status === "ineligible" &&
          evidence.qualification?.missingKinds?.length === 0
        );
      } catch {
        return false;
      }
    },
    null,
    { timeout: 10000 },
  );
  const performanceEvidence = await page.evaluate(() =>
    JSON.parse(
      window.localStorage.getItem("worlddomination.mapPerformanceEvidence.v1"),
    ),
  );
  assert(
    Number.isFinite(Date.parse(performanceEvidence.capturedAt)) &&
      typeof performanceEvidence.application?.sessionId === "string" &&
      performanceEvidence.application.sessionId.length > 0 &&
      performanceEvidence.r3f?.featureFlags?.conquestPulse === true &&
      performanceEvidence.r3f?.featureFlags?.orderReveal === true &&
      performanceEvidence.r3f?.shaderCompilation?.conquestPulse === true &&
      typeof performanceEvidence.r3f?.shaderCompilation?.orderReveal ===
        "boolean" &&
      performanceEvidence.r3f?.rendererStability?.requiredBattleCount === 50 &&
      performanceEvidence.r3f?.rendererStability?.observedBattleCount >= 1,
    `R3F performance evidence omitted provenance: ${JSON.stringify(performanceEvidence)}`,
  );
  assert(
    await page.getByTestId("map-performance-evidence").isEnabled(),
    "Completed R3F performance evidence was not exportable",
  );
  console.log("ok - fail-closed R3F performance qualification");
  await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem("worlddomination.db.saveSlot");
      if (!raw) return false;
      try {
        const state = JSON.parse(raw)?.state;
        return (
          state?.battlesFought > 0 &&
          state?.lastBattle?.from === "brazil" &&
          state?.lastBattle?.to === "northAfrica"
        );
      } catch {
        return false;
      }
    },
    null,
    { timeout: 10000 },
  );

  console.log("checking - R3F save restore presentation");
  const restoreUrl = new URL("/game?renderer=r3f", page.url()).toString();
  await page.goto(restoreUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (expectedBattleId) =>
      globalThis.__WORLD_DOMINATION_R3F__?.ready === true &&
      globalThis.__WORLD_DOMINATION_R3F__?.canonicalBattleId ===
        expectedBattleId,
    battleId,
    { timeout: 30000 },
  );
  const restored = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    restored.battleActive === false && restored.battleId === null,
    "R3F replayed a historical battle after save restore",
  );
  await page.waitForTimeout(2400);
  const restoredSettled = await page.evaluate(
    () => globalThis.__WORLD_DOMINATION_R3F__,
  );
  assert(
    restoredSettled.battleActive === false &&
      restoredSettled.canonicalBattleId === battleId,
    "R3F started a delayed historical battle after save restore",
  );
  await assertR3FCanvasPixels(page, "restored R3F tabletop");
  console.log("ok - R3F save restore presentation");
}

async function assertR3FQualificationSequence(page) {
  console.log("checking - repeated R3F qualification sequence");
  await page.waitForFunction(
    () => {
      const scene = globalThis.__WORLD_DOMINATION_R3F__;
      const profiles = scene?.performanceQualification?.profiles;
      return (
        scene?.ready === true &&
        scene.qualificationBattleSequence?.requested === 2 &&
        scene.qualificationBattleSequence?.completed === 2 &&
        scene.qualificationBattleSequence?.active === false &&
        scene.visualEffectsActive === false &&
        scene.conquestPulse?.compiledEver === true &&
        scene.sealedOrderReveal?.compiledEver === true &&
        profiles?.["battle-cold"]?.report?.renderer?.sampleCount > 0 &&
        profiles?.["battle-warm"]?.report?.renderer?.sampleCount > 0 &&
        profiles?.["conquest-pulse"]?.report?.renderer?.sampleCount > 0 &&
        scene.rendererStability?.observedBattleCount === 2
      );
    },
    null,
    { timeout: 30000 },
  );
  const scene = await page.evaluate(() => globalThis.__WORLD_DOMINATION_R3F__);
  assert(
    scene.pickerMeshCount === scene.territoryCount &&
      scene.rendererStability.requiredBattleCount === 50 &&
      scene.rendererStability.complete === false &&
      scene.rendererStability.stable === false,
    `R3F repeated qualification sequence was invalid: ${JSON.stringify({ sequence: scene.qualificationBattleSequence, stability: scene.rendererStability, pickerMeshCount: scene.pickerMeshCount })}`,
  );
  await assertR3FCanvasPixels(page, "repeated R3F qualification sequence");
  console.log("ok - repeated R3F qualification sequence");
}

async function assertR3FExpandedLabelLayer(page) {
  console.log("checking - expanded R3F territory labels");
  await page.waitForFunction(
    () => {
      const scene = globalThis.__WORLD_DOMINATION_R3F__;
      return (
        scene?.ready === true &&
        scene.variant === "expanded" &&
        scene.territoryCount === 48 &&
        scene.pickerMeshCount === 48 &&
        scene.territoryLabelCount === 48
      );
    },
    null,
    { timeout: 30000 },
  );
  await assertR3FCanvasPixels(page, "expanded R3F tabletop");
  console.log("ok - expanded R3F territory labels");
}

async function assertR3FMultiplayerSnapshots(browser, origin, errors) {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: undefined,
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    errors.push(`rendered R3F multiplayer snapshots: ${error.message}`),
  );

  let snapshot = null;
  let requestCount = 0;
  await context.route("**/api/multiplayer/matches/**", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: snapshot ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(
        snapshot ?? {
          error: "SNAPSHOT_NOT_READY",
          message: "Snapshot fixture is not ready.",
        },
      ),
    });
  });

  try {
    console.log("checking - rendered R3F multiplayer snapshots");
    await assertRenderedRoute(
      page,
      `${origin}/game?autostart=1&attackDemo=1&players=2`,
      ["Napoleon", "ATTACK", "BATTLES:"],
      "rendered multiplayer snapshot seed",
    );
    await page.waitForFunction(
      () => {
        const raw = window.localStorage.getItem("worlddomination.db.saveSlot");
        return Boolean(raw && JSON.parse(raw)?.state?.players?.length === 2);
      },
      null,
      { timeout: 10000 },
    );
    const state = await page.evaluate(() => {
      const raw = window.localStorage.getItem("worlddomination.db.saveSlot");
      return JSON.parse(raw).state;
    });
    state.phase = "attack";
    state.currentPlayer = 0;
    state.awaitingHandoff = false;
    state.pendingOccupy = null;
    state.battlesFought = 5;
    state.lastBattle = {
      from: "brazil",
      to: "northAfrica",
      attacker: 0,
      defender: 1,
      attackerRolls: [6, 4, 2],
      defenderRolls: [5, 1],
      attackerLosses: 1,
      defenderLosses: 1,
      rounds: 1,
      conquered: false,
      attackerTier: "classicAttack",
      defenderTier: "classicDefend",
    };
    snapshot = {
      id: "renderer-contract",
      version: 1,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:01.000Z",
      seats: [],
      you: 0,
      state,
    };
    await page.evaluate(
      ({ apiBaseUrl }) => {
        window.localStorage.setItem(
          "worlddomination.multiplayer.session",
          JSON.stringify({
            apiBaseUrl,
            matchId: "renderer-contract",
            playerToken: "browser-renderer-seat",
            playerId: 0,
            updatedAt: "2026-07-30T00:00:01.000Z",
          }),
        );
      },
      { apiBaseUrl: `${origin}/api` },
    );

    const commandState = JSON.parse(JSON.stringify(state));
    commandState.setup.turnStyle = "sameTime";
    commandState.phase = "sameTimeBattle";
    commandState.sameTime = {
      reinforcementsRemaining: [0, 0],
      deployLog: [[], []],
      readyReinforce: [true, true],
      orders: [
        {
          id: "browser-order-1",
          player: 0,
          from: "alaska",
          to: "northwestTerritory",
          count: 3,
          surgeTo: null,
        },
        {
          id: "browser-order-2",
          player: 1,
          from: "greenland",
          to: "quebec",
          count: 2,
          surgeTo: null,
        },
      ],
      readyBattle: [true, false],
      playback: [],
      moves: [],
      readyMove: [false, false],
    };
    snapshot = {
      ...snapshot,
      version: 7,
      seats: [
        {
          playerId: 0,
          claimed: true,
          playerName: "Napoleon",
          isHuman: true,
          invited: false,
          invitedUserId: null,
          invitedByPlayerId: null,
          sessionBound: true,
          sessionId: "browser-renderer-session",
          sessionLabel: "Napoleon",
          userBound: false,
          userId: null,
          lastSeenAt: "2026-07-30T00:00:01.000Z",
        },
        {
          playerId: 1,
          claimed: false,
          playerName: "Wellington",
          isHuman: true,
          invited: true,
          invitedUserId: "user-wellington",
          invitedByPlayerId: 0,
          sessionBound: false,
          sessionId: null,
          sessionLabel: null,
          userBound: true,
          userId: "user-wellington",
          lastSeenAt: null,
        },
      ],
      state: commandState,
    };

    await assertRenderedRoute(
      page,
      `${origin}/multiplayer`,
      [
        "MULTIPLAYER COMMAND",
        "MATCH V7 LINKED",
        "Sealed attack table",
        "5 armies committed",
        "Ready",
        "Waiting",
        "Invited",
        "Open Battle Map",
      ],
      "rendered linked multiplayer command briefing",
    );
    await page
      .getByTestId("multiplayer-round-briefing")
      .waitFor({ state: "visible", timeout: 10000 });
    await assertNoHorizontalOverflow(
      page,
      "rendered linked multiplayer command briefing",
    );

    snapshot = {
      ...snapshot,
      version: 1,
      seats: [],
      state,
    };

    await assertRenderedRoute(
      page,
      `${origin}/multiplayer-game?renderer=r3f`,
      ["MULTIPLAYER BATTLEFIELD", "3D", "ATTACK"],
      "rendered R3F multiplayer battlefield",
    );
    await page.waitForFunction(
      () =>
        globalThis.__WORLD_DOMINATION_R3F__?.ready === true &&
        Boolean(globalThis.__WORLD_DOMINATION_R3F__?.canonicalBattleId),
      null,
      { timeout: 30000 },
    );
    const initial = await page.evaluate(
      () => globalThis.__WORLD_DOMINATION_R3F__,
    );
    assert(
      initial.battleActive === false && initial.battleId === null,
      "R3F replayed historical battle data from the initial multiplayer snapshot",
    );
    const initialRevision = initial.sceneRevision;
    const initialBattleId = initial.canonicalBattleId;
    await assertR3FCanvasPixels(page, "multiplayer R3F tabletop");
    await page.getByLabel("Battle scene pacing").first().click();
    await page.getByLabel("Battle scene pacing").first().click();
    await page.getByText("BATTLES: OFF").waitFor({ timeout: 10000 });

    const nextState = JSON.parse(JSON.stringify(state));
    nextState.battlesFought = 6;
    nextState.territories.china = {
      ...nextState.territories.china,
      armies: nextState.territories.china.armies + 1,
    };
    nextState.lastBattle = {
      ...nextState.lastBattle,
      from: "china",
      to: "india",
      attackerRolls: [6, 5, 3],
      defenderRolls: [4, 2],
    };
    snapshot = {
      ...snapshot,
      version: 2,
      updatedAt: "2026-07-30T00:00:02.000Z",
      state: nextState,
    };

    await page.waitForFunction(
      (previousBattleId) =>
        globalThis.__WORLD_DOMINATION_R3F__?.battleActive === true &&
        globalThis.__WORLD_DOMINATION_R3F__?.battleId !== previousBattleId,
      initialBattleId,
      { timeout: 8000 },
    );
    const updated = await page.evaluate(
      () => globalThis.__WORLD_DOMINATION_R3F__,
    );
    assert(
      updated.sceneRevision !== initialRevision,
      "R3F scene revision did not change for a multiplayer army/battle update",
    );
    assert(
      updated.canonicalBattleId === updated.battleId,
      "R3F multiplayer presentation did not match the new canonical battle",
    );
    const updatedBattleId = updated.battleId;

    await page.waitForFunction(
      () => globalThis.__WORLD_DOMINATION_R3F__?.battleActive === false,
      null,
      { timeout: 5000 },
    );
    await page.waitForTimeout(3400);
    const repeated = await page.evaluate(
      () => globalThis.__WORLD_DOMINATION_R3F__,
    );
    assert(
      repeated.battleActive === false &&
        repeated.battleId === null &&
        repeated.canonicalBattleId === updatedBattleId,
      "R3F replayed a battle after an identical multiplayer polling snapshot",
    );
    assert(
      requestCount >= 3,
      `multiplayer R3F smoke observed too few snapshot requests: ${requestCount}`,
    );
    console.log("ok - rendered R3F multiplayer snapshots");
  } finally {
    await context.close();
  }
}

async function assertRenderedPreview() {
  const { chromium } = require("playwright");
  const executablePath = await findBrowserExecutable();
  assert(
    executablePath,
    "No Chrome/Chromium found for rendered browser smoke. Run `pnpm --filter @workspace/mobile exec playwright install chromium` or set BROWSER_SMOKE_CHROME.",
  );

  const { server, origin } = await startStaticServer();
  const errors = [];
  let browser = null;
  let loadedImages = 0;
  let restoredSave = false;
  async function withFreshPage(
    pathname,
    snippets,
    label,
    verify,
    viewport = VIEWPORTS.portrait,
  ) {
    assert(browser, "browser has not started");
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
    console.log(`checking - ${label}`);
    try {
      await assertRenderedRoute(page, `${origin}${pathname}`, snippets, label);
      if (verify) await verify(page);
      console.log(`ok - ${label}`);
    } catch (error) {
      throw new Error(`${label}: ${error.message || error}`);
    } finally {
      await context.close();
    }
  }

  async function assertBrowserSaveRestore() {
    assert(browser, "browser has not started");
    const context = await browser.newContext({ viewport: VIEWPORTS.portrait });
    try {
      const seeded = await context.newPage();
      seeded.on("pageerror", (error) =>
        errors.push(`rendered save seed: ${error.message}`),
      );
      await assertRenderedRoute(
        seeded,
        `${origin}/game?autostart=1&renderer=svg&extra=1`,
        ["Napoleon", "REINFORCE", "Deploy", "Hawaii"],
        "rendered save seed game screen",
      );
      await seeded.waitForFunction(
        () => {
          const raw = window.localStorage.getItem(
            "worlddomination.db.saveSlot",
          );
          if (!raw) return false;
          try {
            const stored = JSON.parse(raw);
            return (
              stored?.state?.turn === 1 &&
              stored?.state?.players?.[0]?.name === "Napoleon"
            );
          } catch {
            return false;
          }
        },
        null,
        { timeout: 10000 },
      );
      await seeded.close();

      const restored = await context.newPage();
      restored.on("pageerror", (error) =>
        errors.push(`rendered save restore: ${error.message}`),
      );
      await assertRenderedRoute(
        restored,
        `${origin}/game?renderer=svg`,
        ["Napoleon", "REINFORCE", "Deploy", "Hawaii"],
        "rendered restored saved game screen",
      );
      await restored.close();
      restoredSave = true;
    } finally {
      await context.close();
    }
  }

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    });

    await withFreshPage(
      "/",
      [
        "WORLD",
        "DOMINATION",
        "NEW CAMPAIGN",
        "MULTIPLAYER COMMAND",
        "TOURNAMENT",
        "HALL OF RECORDS",
      ],
      "rendered home screen",
      async (page) => {
        const bodyText = await page
          .locator("body")
          .innerText({ timeout: 10000 });
        assertIncludes(bodyText, "COMMAND DISPATCH", "rendered home screen");
        const newCampaign = await assertLabeledControl(
          page,
          "New Campaign",
          "rendered home screen",
        );
        await assertMinTouchTarget(
          newCampaign,
          44,
          "rendered home New Campaign control",
        );
        const multiplayer = await assertLabeledControl(
          page,
          "Multiplayer Command",
          "rendered home screen",
        );
        await assertMinTouchTarget(
          multiplayer,
          44,
          "rendered home Multiplayer Command control",
        );
      },
    );
    await withFreshPage(
      "/setup",
      [
        "NEW CAMPAIGN",
        "COMMANDERS",
        "TURN STYLE",
        "Same Time RISK",
        "Extended Map",
        "Open muster",
        "Attack line",
        "LAUNCH CAMPAIGN",
      ],
      "rendered setup screen",
      async (page) => {
        let bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assert(
          !bodyText.includes("Restricted Reinforcement"),
          "rendered setup screen showed restricted reinforcement before Same Time selection",
        );
        assertIncludes(
          bodyText,
          "Open muster",
          "rendered setup Classic doctrine",
        );
        assertIncludes(
          bodyText,
          "Occupation",
          "rendered setup Classic doctrine",
        );
        await page
          .getByText("Same Time RISK", { exact: true })
          .click({ timeout: 10000 });
        bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assertIncludes(
          bodyText,
          "Restricted Reinforcement",
          "rendered setup Same Time controls",
        );
        assertIncludes(
          bodyText,
          "Cap each turn's reinforcements",
          "rendered setup Same Time controls",
        );
        assertIncludes(
          bodyText,
          "Sealed attacks",
          "rendered setup Same Time doctrine",
        );
        assertIncludes(
          bodyText,
          "committed armies",
          "rendered setup Same Time doctrine",
        );
        assertIncludes(
          bodyText,
          "border clashes",
          "rendered setup Same Time doctrine",
        );
      },
    );
    await withFreshPage(
      "/records",
      [
        "HALL OF RECORDS",
        "CAMPAIGN LEDGER",
        "TOURNAMENT HIGH SCORES",
        "Wellington",
        "1310 pts",
      ],
      "rendered records screen",
    );
    await withFreshPage(
      "/tournament",
      [
        "TOURNAMENT",
        "COMMANDER",
        "BEGIN TOURNAMENT",
        "HIGH SCORES",
        "Wellington",
        "1310 pts",
      ],
      "rendered tournament screen",
    );
    await withFreshPage(
      "/multiplayer",
      [
        "MULTIPLAYER COMMAND",
        "API Base URL",
        "Server-authoritative Same Time command board",
        "API ROUTE READY",
        "NO LINKED MATCH",
        "Quick Match",
        "Create Host Seat",
        "Joinable",
        "Active",
        "Finished",
        "Refresh Lobby",
        "PENDING INVITATIONS",
        "Refresh Invitations",
        "Watch Invitations",
        "CONTACTS",
        "Refresh Contacts",
        "INVITE SEAT",
        "Trusted User ID",
        "Invite Seat",
        "Join Seat",
        "No linked match.",
      ],
      "rendered multiplayer command screen",
      async (page) => {
        await assertNoHorizontalOverflow(
          page,
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "MULTIPLAYER COMMAND",
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "API ROUTE READY",
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "Quick Match",
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "Create Host Seat",
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "Joinable",
          "rendered multiplayer command screen",
        );
        await assertTextWithinViewport(
          page,
          "Refresh Lobby",
          "rendered multiplayer command screen",
        );
        for (const [label, controlLabel] of [
          ["Quick Match", "rendered multiplayer quick-match control"],
          ["Create Host Seat", "rendered multiplayer host-seat control"],
          [
            "Show joinable lobby matches",
            "rendered multiplayer joinable filter",
          ],
          [
            "Show public lobby scope",
            "rendered multiplayer public scope filter",
          ],
          ["Refresh Lobby", "rendered multiplayer refresh-lobby control"],
          [
            "Watch Invitations",
            "rendered multiplayer watch-invitations control",
          ],
          ["Invite Seat", "rendered multiplayer invite-seat control"],
          ["Join Seat", "rendered multiplayer join-seat control"],
        ]) {
          await assertMinTouchTarget(
            await assertLabeledControl(page, label, controlLabel),
            44,
            controlLabel,
          );
        }
      },
    );
    await withFreshPage(
      "/multiplayer-game",
      [
        "MULTIPLAYER BATTLEFIELD",
        "No linked multiplayer match.",
        "Return to Command",
      ],
      "rendered multiplayer battlefield no-session screen",
      async (page) => {
        await assertNoHorizontalOverflow(
          page,
          "rendered multiplayer battlefield no-session screen",
        );
        await assertTextWithinViewport(
          page,
          "MULTIPLAYER BATTLEFIELD",
          "rendered multiplayer battlefield no-session screen",
        );
        await assertTextWithinViewport(
          page,
          "Return to Command",
          "rendered multiplayer battlefield no-session screen",
        );
        await assertMinTouchTarget(
          await assertLabeledControl(
            page,
            "Return to command",
            "rendered multiplayer battlefield return control",
          ),
          44,
          "rendered multiplayer battlefield return control",
        );
      },
    );
    await withFreshPage(
      "/game?autostart=1",
      ["Napoleon", "REINFORCE", "Deploy", "3D", "BATTLES:"],
      "rendered production-default R3F game screen",
      assertDefaultR3FRenderer,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg",
      ["PACIFIC", "OCEAN", "Napoleon", "REINFORCE", "Deploy", "Madagascar"],
      "rendered seeded classic standard-map game screen",
      async (page) => {
        const bodyText = await page
          .locator("body")
          .innerText({ timeout: 10000 });
        assert(
          !bodyText.includes("W. Africa"),
          "standard map rendered optional West Africa",
        );
        assert(
          !bodyText.includes("Hawaii"),
          "standard map rendered optional Hawaii",
        );
        await assertTransparentMapChrome(page, "rendered standard map");
        await assertCameraInteraction(page, "rendered standard map camera");
      },
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&extra=1",
      [
        "PACIFIC",
        "OCEAN",
        "Napoleon",
        "REINFORCE",
        "Deploy",
        "Hawaii",
        "Svalbard",
        "Madagascar",
        "W. Africa",
      ],
      "rendered seeded classic expanded-map game screen",
      async (page) => {
        loadedImages = await page
          .locator("img")
          .evaluateAll(
            (images) =>
              images.filter(
                (image) =>
                  image.complete &&
                  image.naturalWidth > 0 &&
                  image.naturalHeight > 0,
              ).length,
          );
        await page
          .getByText("BOARD", { exact: true })
          .click({ timeout: 10000 });
        let bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assertIncludes(bodyText, "OWNERSHIP", "rendered map view-mode control");

        await (
          await assertLabeledControl(
            page,
            "Open commander roster",
            "rendered commander roster control",
          )
        ).click();
        bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assertIncludes(
          bodyText,
          "COMMANDERS",
          "rendered commander roster overlay",
        );
        assertIncludes(
          bodyText,
          "Wellington",
          "rendered commander roster overlay",
        );
        await assertTextWithinViewport(
          page,
          "COMMANDERS",
          "rendered commander roster overlay",
        );
        await assertNoHorizontalOverflow(
          page,
          "rendered commander roster overlay",
        );
        await assertBackgroundAlpha(
          page.getByTestId("map-roster-overlay"),
          0.34,
          "rendered commander roster overlay",
        );
        await (
          await assertLabeledControl(
            page,
            "Close commander roster",
            "rendered commander roster close control",
          )
        ).click();

        await (
          await assertLabeledControl(
            page,
            "Open field dispatch",
            "rendered field dispatch control",
          )
        ).click();
        bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assertIncludes(
          bodyText,
          "FIELD DISPATCH",
          "rendered field dispatch overlay",
        );
        await assertTextWithinViewport(
          page,
          "FIELD DISPATCH",
          "rendered field dispatch overlay",
        );
        await assertNoHorizontalOverflow(
          page,
          "rendered field dispatch overlay",
        );
        await assertBackgroundAlpha(
          page.getByTestId("map-dispatch-sheet"),
          0.4,
          "rendered field dispatch overlay",
        );
        const dispatchClose = await assertLabeledControl(
          page,
          "Close field dispatch",
          "rendered field dispatch close control",
        );
        await assertMinTouchTarget(
          dispatchClose,
          44,
          "rendered field dispatch close control",
        );
        await dispatchClose.click();
      },
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&cards=1&players=2",
      ["Napoleon", "REINFORCE", "Open Cards (must trade)"],
      "rendered card-hand input blocker",
      async (page) => {
        await page
          .getByRole("button", { name: "Open Cards (must trade)" })
          .click({ timeout: 10000 });
        let bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assertIncludes(bodyText, "RISK CARDS", "rendered card hand overlay");
        assertIncludes(
          bodyText,
          "Must trade (5+ cards)",
          "rendered card hand overlay",
        );
        await assertTextWithinViewport(
          page,
          "RISK CARDS",
          "rendered card hand overlay",
        );
        await assertNoHorizontalOverflow(page, "rendered card hand overlay");
        await assertBackgroundAlpha(
          page.getByTestId("map-card-hand"),
          0.4,
          "rendered card hand overlay",
        );
        const blocker = page.getByTestId("map-card-input-blocker");
        await blocker.waitFor({ state: "visible", timeout: 10000 });
        const blockerBox = await blocker.boundingBox();
        const viewport = page.viewportSize();
        assert(
          blockerBox &&
            viewport &&
            blockerBox.width >= viewport.width - 2 &&
            blockerBox.height >= viewport.height - 2,
          "rendered card hand blocker did not cover the map",
        );
        await blocker.click({ position: { x: 20, y: 20 }, timeout: 10000 });
        await page
          .getByTestId("map-card-hand")
          .waitFor({ state: "hidden", timeout: 10000 });
        bodyText = await page.locator("body").innerText({ timeout: 10000 });
        assert(
          !bodyText.includes("RISK CARDS"),
          "card hand blocker did not dismiss the overlay",
        );
      },
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&extra=1",
      [
        "PACIFIC",
        "OCEAN",
        "Napoleon",
        "REINFORCE",
        "Deploy",
        "Hawaii",
        "Svalbard",
      ],
      "rendered desktop classic expanded-map game screen",
      async (page) => {
        await assertNoHorizontalOverflow(
          page,
          "rendered desktop classic expanded-map game screen",
        );
        await assertTextWithinViewport(
          page,
          "REINFORCE",
          "rendered desktop classic expanded-map game screen",
        );
        await assertTextWithinViewport(
          page,
          "BATTLES:",
          "rendered desktop classic expanded-map game screen",
        );
        await assertTransparentMapChrome(page, "rendered desktop expanded map");
      },
      VIEWPORTS.desktop,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=r3f&attackDemo=1&players=2",
      ["Napoleon", "ATTACK", "3D", "BATTLES:"],
      "rendered R3F attack vertical slice",
      assertR3FVerticalSlice,
      VIEWPORTS.desktop,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=r3f&qualificationBattles=2&players=2",
      ["Napoleon", "REINFORCE", "3D", "BATTLES:"],
      "rendered repeated R3F qualification sequence",
      assertR3FQualificationSequence,
      VIEWPORTS.desktop,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=r3f&extra=1&players=2",
      ["Napoleon", "REINFORCE", "3D", "BATTLES:"],
      "rendered expanded R3F label layer",
      assertR3FExpandedLabelLayer,
      VIEWPORTS.desktop,
    );
    await assertR3FMultiplayerSnapshots(browser, origin, errors);
    await withFreshPage(
      "/game?autostart=1&renderer=svg&turnStyle=sameTime&restricted=1&extra=1",
      [
        "Napoleon",
        "REINFORCE (SIM)",
        "I. MUSTER",
        "II. SEAL",
        "Deploy",
        "in secret",
        "Seal Reinforcements",
        "Hawaii",
      ],
      "rendered seeded Same Time game screen",
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&turnStyle=sameTime&restricted=1&extra=1",
      [
        "Napoleon",
        "REINFORCE (SIM)",
        "I. MUSTER",
        "II. SEAL",
        "Deploy",
        "in secret",
        "Seal Reinforcements",
        "Hawaii",
      ],
      "rendered landscape Same Time game screen",
      async (page) => {
        await assertLandscapeCommandPanelUsesEdgeRail(
          page,
          "rendered landscape Same Time game screen",
        );
        await assertNoHorizontalOverflow(
          page,
          "rendered landscape Same Time game screen",
        );
        await assertTextWithinViewport(
          page,
          "REINFORCE (SIM)",
          "rendered landscape Same Time game screen",
        );
        await assertTextWithinViewport(
          page,
          "Seal Reinforcements",
          "rendered landscape Same Time game screen",
        );
        await assertMinTouchTarget(
          await assertLabeledControl(
            page,
            "Seal Reinforcements",
            "rendered Same Time reinforcement seal control",
          ),
          44,
          "rendered Same Time reinforcement seal control",
        );
      },
      VIEWPORTS.landscape,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&orders=1&extra=1",
      [
        "Napoleon",
        "ORDERS (SIM)",
        "II. SEAL",
        "Stage attack orders in secret",
        "Seal Attack Orders",
        "Alaska",
      ],
      "rendered landscape Same Time attack-order screen",
      async (page) => {
        await assertLandscapeCommandPanelUsesEdgeRail(
          page,
          "rendered landscape Same Time attack-order screen",
        );
        await assertNoHorizontalOverflow(
          page,
          "rendered landscape Same Time attack-order screen",
        );
        await assertTextWithinViewport(
          page,
          "ORDERS (SIM)",
          "rendered landscape Same Time attack-order screen",
        );
        await assertTextWithinViewport(
          page,
          "Seal Attack Orders",
          "rendered landscape Same Time attack-order screen",
        );
        await assertMinTouchTarget(
          await assertLabeledControl(
            page,
            "Seal Attack Orders",
            "rendered Same Time attack-order seal control",
          ),
          44,
          "rendered Same Time attack-order seal control",
        );
      },
      VIEWPORTS.landscape,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=r3f&playback=1&extra=1",
      ["Napoleon", "BATTLE REPORT", "CONQUERED"],
      "rendered R3F Same Time reveal shader",
      async (page) => {
        await page.waitForFunction(
          () => {
            const scene = globalThis.__WORLD_DOMINATION_R3F__;
            return (
              scene?.ready === true &&
              scene?.sealedOrderReveal?.compiledEver === true
            );
          },
          null,
          { timeout: 30000 },
        );
        const reveal = await page.evaluate(
          () => globalThis.__WORLD_DOMINATION_R3F__,
        );
        assert(
          reveal.sealedOrderReveal.compiledEver === true &&
            reveal.pickerMeshCount === reveal.territoryCount &&
            (reveal.revealIds.some((id) => id.startsWith("playback:")) ||
              reveal.lastCompletedRevealId?.startsWith("playback:")),
          `R3F playback reveal did not compile independently of picking: ${JSON.stringify({ reveal: reveal.sealedOrderReveal, revealIds: reveal.revealIds, completed: reveal.lastCompletedRevealId, pickerMeshCount: reveal.pickerMeshCount })}`,
        );
        await page.waitForFunction(
          () =>
            globalThis.__WORLD_DOMINATION_R3F__?.visualEffectsActive ===
              false &&
            globalThis.__WORLD_DOMINATION_R3F__?.lastCompletedRevealId?.startsWith(
              "playback:",
            ),
          null,
          { timeout: 10000 },
        );
        console.log("ok - R3F sealed-order playback reveal and idle return");
      },
      VIEWPORTS.landscape,
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&playback=1&extra=1",
      [
        "Napoleon",
        "ROUND 1",
        "III. REVIEW",
        "IV. MARCH",
        "BATTLE REPORT",
        "LAST BATTLE",
        "CONQUERED",
        "PROCEED TO MOVEMENT",
      ],
      "rendered Same Time battle playback screen",
      async (page) => {
        const proceed = await assertLabeledControl(
          page,
          "Proceed to tactical movement",
          "rendered Same Time playback proceed control",
        );
        await assertMinTouchTarget(
          proceed,
          44,
          "rendered Same Time playback proceed control",
        );
        await proceed.click({ timeout: 10000 });
        const bodyText = await page
          .locator("body")
          .innerText({ timeout: 10000 });
        assertIncludes(
          bodyText,
          "MOVEMENT (SIM)",
          "rendered Same Time movement after playback",
        );
        assertIncludes(
          bodyText,
          "Confirm Movement",
          "rendered Same Time movement after playback",
        );
        await assertMinTouchTarget(
          await assertLabeledControl(
            page,
            "Confirm Movement",
            "rendered Same Time movement confirm control",
          ),
          44,
          "rendered Same Time movement confirm control",
        );
      },
    );
    await withFreshPage(
      "/game?autostart=1&renderer=svg&victory=1",
      ["Napoleon", "VICTORY", "Capital cities seized", "CAMPAIGN STATISTICS"],
      "rendered landscape victory statistics screen",
      async (page) => {
        await assertNoHorizontalOverflow(
          page,
          "rendered landscape victory statistics screen",
        );
        const viewport = page.viewportSize();
        assert(
          viewport,
          "rendered landscape victory statistics screen missing viewport size",
        );
        const victoryBox = await page
          .getByTestId("map-victory-sheet")
          .boundingBox();
        assert(
          victoryBox &&
            victoryBox.x > viewport.width * 0.45 &&
            victoryBox.x + victoryBox.width <= viewport.width + 1,
          "victory sheet was not docked to the right edge",
        );
        const statsControl = await assertLabeledControl(
          page,
          "Open campaign statistics",
          "rendered victory statistics control",
        );
        await assertMinTouchTarget(
          statsControl,
          44,
          "rendered victory statistics control",
        );
        await assertMinTouchTarget(
          await assertLabeledControl(
            page,
            "Return to main menu",
            "rendered victory return control",
          ),
          44,
          "rendered victory return control",
        );
        await statsControl.click({ timeout: 10000 });
        const statsSheet = page.getByTestId("map-stats-sheet");
        await statsSheet.waitFor({ state: "visible", timeout: 10000 });
        const statsBox = await statsSheet.boundingBox();
        assert(
          statsBox &&
            statsBox.x > viewport.width * 0.45 &&
            statsBox.width >= 340 &&
            statsBox.width <= 500 &&
            statsBox.x + statsBox.width <= viewport.width + 1,
          "statistics sheet was not a right-edge command rail",
        );
        const chartBox = await statsSheet.locator("svg").first().boundingBox();
        assert(
          chartBox && chartBox.width >= 260 && chartBox.height >= 150,
          "statistics chart did not render with a stable landscape size",
        );
        await page
          .getByText("ARMIES", { exact: true })
          .click({ timeout: 10000 });
        await page
          .getByText("CONTINUE", { exact: true })
          .click({ timeout: 10000 });
        await statsSheet.waitFor({ state: "hidden", timeout: 10000 });
        await page
          .getByTestId("map-victory-sheet")
          .waitFor({ state: "visible", timeout: 10000 });
      },
      VIEWPORTS.landscape,
    );
    await assertBrowserSaveRestore();

    assert(
      loadedImages >= 4,
      `rendered seeded game loaded too few images: ${loadedImages}`,
    );
    assert(restoredSave, "browser fallback save/restore was not verified");
    assert(
      errors.length === 0,
      `rendered browser emitted page errors: ${errors.join("; ")}`,
    );
    console.log(
      `ok - rendered browser smoke covered home/setup/restricted setup/records/tournament/multiplayer command+battlefield/R3F multiplayer snapshots/classic standard+expanded maps/roster+dispatch/victory statistics/Same Time/orders/playback/R3F save-restore across portrait/landscape/desktop with ${loadedImages} game images`,
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log("Exporting Expo web preview...");
  run(
    expoBin(),
    [
      "export",
      "--platform",
      "web",
      "--output-dir",
      ".browser-build",
      "--clear",
    ],
    {
      EXPO_PUBLIC_BROWSER_SMOKE: "1",
      EXPO_PUBLIC_R3F_CONQUEST_PULSE: "1",
      EXPO_PUBLIC_R3F_ORDER_REVEAL: "1",
    },
  );
  assertExportShape();
  await assertRenderedPreview();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
