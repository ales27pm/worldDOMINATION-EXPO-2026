const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, '.browser-build');
const VIEWPORTS = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
  desktop: { width: 1280, height: 720 },
};

function run(command, args, env = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function expoBin() {
  const bin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo');
  if (!fs.existsSync(bin)) {
    throw new Error('Expo CLI not found. Run pnpm install before browser smoke tests.');
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
  assert(fs.existsSync(filePath), `${label} missing: ${path.relative(projectRoot, filePath)}`);
  const stat = fs.statSync(filePath);
  assert(stat.size > 0, `${label} is empty: ${path.relative(projectRoot, filePath)}`);
}

function assertIncludes(haystack, needle, label) {
  assert(haystack.includes(needle), `${label} missing "${needle}"`);
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.ttf':
      return 'font/ttf';
    case '.mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}

function findWebEntry(indexHtml) {
  const match = indexHtml.match(/<script[^>]+src="([^"]*\/_expo\/static\/js\/web\/[^"]+\.js)"/);
  assert(match, 'index.html does not reference a web JS entry bundle');
  const src = match[1].replace(/^\//, '');
  return path.join(buildDir, src);
}

function assertExportShape() {
  const indexPath = path.join(buildDir, 'index.html');
  const metadataPath = path.join(buildDir, 'metadata.json');
  assertFile(indexPath, 'web index');
  assertFile(metadataPath, 'web metadata');

  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  assertIncludes(indexHtml, '<div id="root"></div>', 'web index');
  assertIncludes(indexHtml, '<title>worldDOMINATION</title>', 'web index');

  const entryPath = findWebEntry(indexHtml);
  assertFile(entryPath, 'web entry bundle');
  const bundle = fs.readFileSync(entryPath, 'utf8');

  // These strings prove the exported browser bundle contains the menu, setup
  // mode switcher, smoke-game seed, and native map presentation modules.
  for (const snippet of [
    'WORLD',
    'DOMINATION',
    'Classic RISK',
    'Same Time RISK',
    'Extended Map',
    'HALL OF RECORDS',
    'Tournament High Scores',
    'MULTIPLAYER COMMAND',
    'Quick Match',
    'Create Host Seat',
    'Joinable',
    'Refresh Lobby',
    'PENDING INVITATIONS',
    'Refresh Invitations',
    'Watch Invitations',
    'CONTACTS',
    'Refresh Contacts',
    'INVITE SEAT',
    'Trusted User ID',
    'Open Battle Map',
    'MULTIPLAYER BATTLEFIELD',
    'OUTLOOK',
    'Attacker edge',
    'No dispatches yet.',
    'REINFORCE (SIM)',
    'Napoleon',
    'Wellington',
    'WORLD_BOARD',
    'North America',
    'Alaska',
    'assets/game/world-map',
  ]) {
    assertIncludes(bundle, snippet, 'web entry bundle');
  }

  const files = walk(buildDir);
  const worldMapAssets = files.filter((file) => /assets\/game\/world-map\.[^.]+\.webp$/.test(file));
  assert(worldMapAssets.length === 1, `expected exactly one bundled world map asset, found ${worldMapAssets.length}`);
  assertFile(worldMapAssets[0], 'bundled world map');

  const pieceAssets = files.filter((file) => /assets\/game\/pieces\/piece-(infantry|cavalry|artillery)\.[^.]+\.png$/.test(file));
  assert(pieceAssets.length === 3, `expected three bundled piece assets, found ${pieceAssets.length}`);
  for (const file of pieceAssets) assertFile(file, 'bundled piece asset');

  const battleViews = files.filter((file) => /assets\/game\/battle-views\/[^/]+\.[^.]+\.webp$/.test(file));
  assert(battleViews.length >= 42, `expected at least 42 bundled battle-view assets, found ${battleViews.length}`);

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  assert(typeof metadata === 'object' && metadata !== null, 'metadata.json is not valid object JSON');

  console.log(`ok - Expo web export produced ${files.length} files`);
  console.log(`ok - web entry bundle ${path.relative(projectRoot, entryPath)}`);
  console.log(`ok - bundled map/piece/battle-view assets are present`);
}

function startStaticServer() {
  const indexPath = path.join(buildDir, 'index.html');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const candidate = path.resolve(buildDir, rel || 'index.html');
    const filePath =
      candidate.startsWith(buildDir) &&
      fs.existsSync(candidate) &&
      fs.statSync(candidate).isFile()
        ? candidate
        : indexPath;

    res.writeHead(200, { 'content-type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('browser smoke server did not return a TCP address'));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_SMOKE_CHROME,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const systemChrome = candidates.find((candidate) => fs.existsSync(candidate));
  if (systemChrome) return systemChrome;

  try {
    const { chromium } = require('playwright');
    const playwrightChrome = chromium.executablePath();
    if (fs.existsSync(playwrightChrome)) return playwrightChrome;
  } catch {
    // Fall through to Puppeteer. Browser install state is validated below.
  }

  try {
    const puppeteer = require('puppeteer');
    const puppeteerChrome = await puppeteer.executablePath();
    if (fs.existsSync(puppeteerChrome)) return puppeteerChrome;
  } catch {
    // The final assertion reports the missing browser with setup guidance.
  }

  return undefined;
}

async function assertRenderedRoute(page, url, snippets, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(750);
  const bodyText = await page.locator('body').innerText({ timeout: 10000 });
  for (const snippet of snippets) assertIncludes(bodyText, snippet, label);
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  const maxScrollWidth = Math.max(metrics.bodyScrollWidth, metrics.documentScrollWidth);
  assert(
    maxScrollWidth <= metrics.viewportWidth + 2,
    `${label} overflowed horizontally: ${maxScrollWidth}px content in ${metrics.viewportWidth}px viewport`,
  );
}

async function assertTextWithinViewport(page, text, label) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const box = await page.waitForFunction(
    (needle) => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const elements = Array.from(document.querySelectorAll('body *'));
      for (const element of elements) {
        if (!element.textContent?.includes(needle)) continue;
        const style = window.getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
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
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const box = await locator.boundingBox();
  assert(box && box.width > 0 && box.height > 0, `${screenLabel} missing labeled control "${label}"`);
  return locator;
}

async function assertBackgroundAlpha(locator, expected, label) {
  await locator.waitFor({ state: 'visible', timeout: 10000 });
  const color = await locator.evaluate((element) => window.getComputedStyle(element).backgroundColor);
  const match = color.match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)$/);
  const alpha = color === 'transparent' ? 0 : match ? (match[1] === undefined ? 1 : Number(match[1])) : NaN;
  assert(Number.isFinite(alpha), `${label} returned an unreadable background color: ${color}`);
  assert(
    Math.abs(alpha - expected) <= 0.011,
    `${label} expected background alpha ${expected}, received ${alpha} (${color})`,
  );
}

async function assertTransparentMapChrome(page, label) {
  await assertBackgroundAlpha(page.getByTestId('map-top-bar'), 0.12, `${label} top bar`);
  await assertBackgroundAlpha(page.getByTestId('map-command-panel'), 0.12, `${label} command panel`);
  await assertBackgroundAlpha(page.getByTestId('map-continent-legend'), 0.12, `${label} continent legend`);
  await assertBackgroundAlpha(page.getByTestId('map-event-ticker'), 0.12, `${label} event ticker`);
  await assertBackgroundAlpha(page.getByTestId('map-view-mode-button'), 0.22, `${label} view-mode control`);
  await assertBackgroundAlpha(page.getByLabel('Focus action'), 0.22, `${label} focus control`);
}

async function cameraTransform(page) {
  return page.getByTestId('map-board-transform').evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(window.getComputedStyle(element).transform);
    return {
      scale: Math.hypot(matrix.a, matrix.b),
      translateX: matrix.e,
      translateY: matrix.f,
    };
  });
}

async function assertCameraInteraction(page, label) {
  const before = await cameraTransform(page);
  await page.getByLabel('Zoom in').click({ timeout: 10000 });
  await page.waitForFunction(
    ({ expected }) => {
      const element = document.querySelector('[data-testid="map-board-transform"]');
      if (!element) return false;
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(element).transform);
      return Math.hypot(matrix.a, matrix.b) > expected * 1.2;
    },
    { expected: before.scale },
    { timeout: 10000 },
  );
  const zoomed = await cameraTransform(page);
  assert(zoomed.scale > before.scale * 1.2, `${label} zoom-in control did not enlarge the board`);

  await page.getByLabel('Zoom out').click({ timeout: 10000 });
  await page.waitForFunction(
    ({ expected }) => {
      const element = document.querySelector('[data-testid="map-board-transform"]');
      if (!element) return false;
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(element).transform);
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

async function assertRenderedPreview() {
  const { chromium } = require('playwright');
  const executablePath = await findBrowserExecutable();
  assert(
    executablePath,
    'No Chrome/Chromium found for rendered browser smoke. Run `pnpm --filter @workspace/mobile exec playwright install chromium` or set BROWSER_SMOKE_CHROME.',
  );

  const { server, origin } = await startStaticServer();
  const errors = [];
  let browser = null;
  let loadedImages = 0;
  let restoredSave = false;
  async function withFreshPage(pathname, snippets, label, verify, viewport = VIEWPORTS.portrait) {
    assert(browser, 'browser has not started');
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    try {
      await assertRenderedRoute(page, `${origin}${pathname}`, snippets, label);
      if (verify) await verify(page);
    } finally {
      await context.close();
    }
  }

  async function assertBrowserSaveRestore() {
    assert(browser, 'browser has not started');
    const context = await browser.newContext({ viewport: VIEWPORTS.portrait });
    try {
      const seeded = await context.newPage();
      seeded.on('pageerror', (error) => errors.push(`rendered save seed: ${error.message}`));
      await assertRenderedRoute(
        seeded,
        `${origin}/game?autostart=1&extra=1`,
        ['Napoleon', 'REINFORCE', 'Deploy', 'Hawaii'],
        'rendered save seed game screen',
      );
      await seeded.waitForFunction(
        () => {
          const raw = window.localStorage.getItem('worlddomination.db.saveSlot');
          if (!raw) return false;
          try {
            const stored = JSON.parse(raw);
            return stored?.state?.turn === 1 && stored?.state?.players?.[0]?.name === 'Napoleon';
          } catch {
            return false;
          }
        },
        null,
        { timeout: 10000 },
      );
      await seeded.close();

      const restored = await context.newPage();
      restored.on('pageerror', (error) => errors.push(`rendered save restore: ${error.message}`));
      await assertRenderedRoute(
        restored,
        `${origin}/game`,
        ['Napoleon', 'REINFORCE', 'Deploy', 'Hawaii'],
        'rendered restored saved game screen',
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
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    await withFreshPage(
      '/',
      ['WORLD', 'DOMINATION', 'NEW CAMPAIGN', 'MULTIPLAYER COMMAND', 'TOURNAMENT', 'HALL OF RECORDS'],
      'rendered home screen',
    );
    await withFreshPage(
      '/setup',
      ['NEW CAMPAIGN', 'COMMANDERS', 'TURN STYLE', 'Same Time RISK', 'Extended Map', 'LAUNCH CAMPAIGN'],
      'rendered setup screen',
      async (page) => {
        let bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assert(
          !bodyText.includes('Restricted Reinforcement'),
          'rendered setup screen showed restricted reinforcement before Same Time selection',
        );
        await page.getByText('Same Time RISK', { exact: true }).click({ timeout: 10000 });
        bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assertIncludes(bodyText, 'Restricted Reinforcement', 'rendered setup Same Time controls');
        assertIncludes(
          bodyText,
          "Cap each turn's reinforcements",
          'rendered setup Same Time controls',
        );
      },
    );
    await withFreshPage(
      '/records',
      ['HALL OF RECORDS', 'CAMPAIGN LEDGER', 'TOURNAMENT HIGH SCORES', 'Wellington', '1310 pts'],
      'rendered records screen',
    );
    await withFreshPage(
      '/tournament',
      ['TOURNAMENT', 'COMMANDER', 'BEGIN TOURNAMENT', 'HIGH SCORES', 'Wellington', '1310 pts'],
      'rendered tournament screen',
    );
    await withFreshPage(
      '/multiplayer',
      ['MULTIPLAYER COMMAND', 'API Base URL', 'Quick Match', 'Create Host Seat', 'Joinable', 'Active', 'Finished', 'Refresh Lobby', 'PENDING INVITATIONS', 'Refresh Invitations', 'Watch Invitations', 'CONTACTS', 'Refresh Contacts', 'INVITE SEAT', 'Trusted User ID', 'Invite Seat', 'Join Seat', 'No linked match.'],
      'rendered multiplayer command screen',
      async (page) => {
        await assertNoHorizontalOverflow(page, 'rendered multiplayer command screen');
        await assertTextWithinViewport(page, 'MULTIPLAYER COMMAND', 'rendered multiplayer command screen');
        await assertTextWithinViewport(page, 'Quick Match', 'rendered multiplayer command screen');
        await assertTextWithinViewport(page, 'Create Host Seat', 'rendered multiplayer command screen');
        await assertTextWithinViewport(page, 'Joinable', 'rendered multiplayer command screen');
        await assertTextWithinViewport(page, 'Refresh Lobby', 'rendered multiplayer command screen');
      },
    );
    await withFreshPage(
      '/multiplayer-game',
      ['MULTIPLAYER BATTLEFIELD', 'No linked multiplayer match.', 'Return to Command'],
      'rendered multiplayer battlefield no-session screen',
      async (page) => {
        await assertNoHorizontalOverflow(page, 'rendered multiplayer battlefield no-session screen');
        await assertTextWithinViewport(page, 'MULTIPLAYER BATTLEFIELD', 'rendered multiplayer battlefield no-session screen');
        await assertTextWithinViewport(page, 'Return to Command', 'rendered multiplayer battlefield no-session screen');
      },
    );
    await withFreshPage(
      '/game?autostart=1',
      ['PACIFIC', 'OCEAN', 'Napoleon', 'REINFORCE', 'Deploy', 'Madagascar'],
      'rendered seeded classic standard-map game screen',
      async (page) => {
        const bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assert(!bodyText.includes('W. Africa'), 'standard map rendered optional West Africa');
        assert(!bodyText.includes('Hawaii'), 'standard map rendered optional Hawaii');
        await assertTransparentMapChrome(page, 'rendered standard map');
        await assertCameraInteraction(page, 'rendered standard map camera');
      },
    );
    await withFreshPage(
      '/game?autostart=1&extra=1',
      ['PACIFIC', 'OCEAN', 'Napoleon', 'REINFORCE', 'Deploy', 'Hawaii', 'Svalbard', 'Madagascar', 'W. Africa'],
      'rendered seeded classic expanded-map game screen',
      async (page) => {
        loadedImages = await page.locator('img').evaluateAll((images) =>
          images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0).length,
        );
        await page.getByText('BOARD', { exact: true }).click({ timeout: 10000 });
        let bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assertIncludes(bodyText, 'OWNERSHIP', 'rendered map view-mode control');

        await (await assertLabeledControl(page, 'Open commander roster', 'rendered commander roster control')).click();
        bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assertIncludes(bodyText, 'COMMANDERS', 'rendered commander roster overlay');
        assertIncludes(bodyText, 'Wellington', 'rendered commander roster overlay');
        await assertTextWithinViewport(page, 'COMMANDERS', 'rendered commander roster overlay');
        await assertNoHorizontalOverflow(page, 'rendered commander roster overlay');
        await assertBackgroundAlpha(
          page.getByTestId('map-roster-overlay'),
          0.34,
          'rendered commander roster overlay',
        );
        await (await assertLabeledControl(page, 'Close commander roster', 'rendered commander roster close control')).click();

        await (await assertLabeledControl(page, 'Open field dispatch', 'rendered field dispatch control')).click();
        bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assertIncludes(bodyText, 'FIELD DISPATCH', 'rendered field dispatch overlay');
        await assertTextWithinViewport(page, 'FIELD DISPATCH', 'rendered field dispatch overlay');
        await assertNoHorizontalOverflow(page, 'rendered field dispatch overlay');
        await assertBackgroundAlpha(
          page.getByTestId('map-dispatch-sheet'),
          0.4,
          'rendered field dispatch overlay',
        );
        await (await assertLabeledControl(page, 'Close field dispatch', 'rendered field dispatch close control')).click();
      },
    );
    await withFreshPage(
      '/game?autostart=1&extra=1',
      ['PACIFIC', 'OCEAN', 'Napoleon', 'REINFORCE', 'Deploy', 'Hawaii', 'Svalbard'],
      'rendered desktop classic expanded-map game screen',
      async (page) => {
        await assertNoHorizontalOverflow(page, 'rendered desktop classic expanded-map game screen');
        await assertTextWithinViewport(page, 'REINFORCE', 'rendered desktop classic expanded-map game screen');
        await assertTextWithinViewport(page, 'BATTLES:', 'rendered desktop classic expanded-map game screen');
        await assertTransparentMapChrome(page, 'rendered desktop expanded map');
      },
      VIEWPORTS.desktop,
    );
    await withFreshPage(
      '/game?autostart=1&turnStyle=sameTime&restricted=1&extra=1',
      ['Napoleon', 'REINFORCE (SIM)', 'Deploy', 'in secret', 'Seal Reinforcements', 'Hawaii'],
      'rendered seeded Same Time game screen',
    );
    await withFreshPage(
      '/game?autostart=1&turnStyle=sameTime&restricted=1&extra=1',
      ['Napoleon', 'REINFORCE (SIM)', 'Deploy', 'in secret', 'Seal Reinforcements', 'Hawaii'],
      'rendered landscape Same Time game screen',
      async (page) => {
        await assertNoHorizontalOverflow(page, 'rendered landscape Same Time game screen');
        await assertTextWithinViewport(page, 'REINFORCE (SIM)', 'rendered landscape Same Time game screen');
        await assertTextWithinViewport(page, 'Seal Reinforcements', 'rendered landscape Same Time game screen');
      },
      VIEWPORTS.landscape,
    );
    await withFreshPage(
      '/game?autostart=1&orders=1&extra=1',
      ['Napoleon', 'ORDERS (SIM)', 'Stage attack orders in secret', 'Seal Attack Orders', 'Alaska'],
      'rendered landscape Same Time attack-order screen',
      async (page) => {
        await assertNoHorizontalOverflow(page, 'rendered landscape Same Time attack-order screen');
        await assertTextWithinViewport(page, 'ORDERS (SIM)', 'rendered landscape Same Time attack-order screen');
        await assertTextWithinViewport(page, 'Seal Attack Orders', 'rendered landscape Same Time attack-order screen');
      },
      VIEWPORTS.landscape,
    );
    await withFreshPage(
      '/game?autostart=1&playback=1&extra=1',
      ['Napoleon', 'ROUND 1', 'BATTLE REPORT', 'LAST BATTLE', 'CONQUERED', 'PROCEED TO MOVEMENT'],
      'rendered Same Time battle playback screen',
      async (page) => {
        await page.getByText(/PROCEED TO MOVEMENT/).click({ timeout: 10000 });
        const bodyText = await page.locator('body').innerText({ timeout: 10000 });
        assertIncludes(bodyText, 'MOVEMENT (SIM)', 'rendered Same Time movement after playback');
        assertIncludes(bodyText, 'Confirm Movement', 'rendered Same Time movement after playback');
      },
    );
    await assertBrowserSaveRestore();

    assert(loadedImages >= 4, `rendered seeded game loaded too few images: ${loadedImages}`);
    assert(restoredSave, 'browser fallback save/restore was not verified');
    assert(errors.length === 0, `rendered browser emitted page errors: ${errors.join('; ')}`);
    console.log(`ok - rendered browser smoke covered home/setup/restricted setup/records/tournament/multiplayer command+battlefield/classic standard+expanded maps/roster+dispatch/Same Time/orders/playback/save-restore across portrait/landscape/desktop with ${loadedImages} game images`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log('Exporting Expo web preview...');
  run(expoBin(), ['export', '--platform', 'web', '--output-dir', '.browser-build', '--clear'], {
    EXPO_PUBLIC_BROWSER_SMOKE: '1',
  });
  assertExportShape();
  await assertRenderedPreview();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
