const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const assetDirectory = path.join(projectRoot, "assets/game/map-3d");
const evidenceDirectory = path.join(workspaceRoot, ".local/map-glb-gate2");
const threeBuildDirectory = path.dirname(require.resolve("three"));
const threeModulePath = path.join(threeBuildDirectory, "three.module.js");
const threeAddonsDirectory = path.resolve(
  threeBuildDirectory,
  "../examples/jsm",
);
const variants = {
  classic: 42,
  expanded: 48,
};
const viewports = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844 },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findBrowserExecutable() {
  if (
    process.env.BROWSER_SMOKE_CHROME &&
    fs.existsSync(process.env.BROWSER_SMOKE_CHROME)
  ) {
    return process.env.BROWSER_SMOKE_CHROME;
  }
  const playwrightChromium = chromium.executablePath();
  if (fs.existsSync(playwrightChromium)) return playwrightChromium;

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ||
    chromium.executablePath()
  );
}

function viewerHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      html, body, canvas { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { background: #15110d; }
      canvas { display: block; }
    </style>
    <script type="importmap">
      {"imports":{"three":"/three.module.js","three/addons/":"/addons/"}}
    </script>
  </head>
  <body>
    <script type="module">
      import * as THREE from "three";
      import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

      const variant = new URLSearchParams(location.search).get("variant") || "expanded";
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x15110d);

      const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      document.body.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xfff4d2, 0x352b24, 2.1));
      const key = new THREE.DirectionalLight(0xfff1d0, 3.2);
      key.position.set(-7, 13, 8);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -10;
      key.shadow.camera.right = 10;
      key.shadow.camera.top = 8;
      key.shadow.camera.bottom = -8;
      scene.add(key);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(18.5, 13),
        new THREE.MeshStandardMaterial({ color: 0x8f7449, roughness: 1, metalness: 0 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.035;
      ground.receiveShadow = true;
      scene.add(ground);

      function capturePixelStats() {
        const gl = renderer.getContext();
        const width = gl.drawingBufferWidth;
        const height = gl.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let coloredPixels = 0;
        const buckets = new Set();
        for (let index = 0; index < pixels.length; index += 16) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          if (Math.abs(red - 21) + Math.abs(green - 17) + Math.abs(blue - 13) > 30) {
            coloredPixels += 1;
          }
          buckets.add(\`\${red >> 4}:\${green >> 4}:\${blue >> 4}\`);
        }
        return {
          coloredRatio: coloredPixels / (pixels.length / 16),
          colorBuckets: buckets.size,
          width,
          height,
        };
      }

      new GLTFLoader().load(
        \`/assets/world-map-\${variant}.glb\`,
        (gltf) => {
          const territoryMeshes = [];
          gltf.scene.traverse((object) => {
            if (object.isMesh && object.name.startsWith("territory__")) {
              object.castShadow = true;
              object.receiveShadow = true;
              territoryMeshes.push(object);
            }
          });
          scene.add(gltf.scene);

          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
          const fitHeight = size.z / (2 * Math.tan(halfFov));
          const fitWidth = size.x / (2 * Math.tan(halfFov) * camera.aspect);
          const distance = Math.max(fitHeight, fitWidth) * 1.18;
          camera.position.set(center.x, distance * 0.94, center.z + distance * 0.34);
          camera.lookAt(center.x, 0, center.z);
          camera.updateProjectionMatrix();

          renderer.render(scene, camera);
          requestAnimationFrame(() => {
            renderer.render(scene, camera);
            window.__MAP_SMOKE__ = {
              ready: true,
              variant,
              territoryCount: territoryMeshes.length,
              metadataCount: territoryMeshes.filter((mesh) => Boolean(mesh.userData.territoryId)).length,
              uniqueNames: new Set(territoryMeshes.map((mesh) => mesh.name)).size,
              bounds: { x: size.x, y: size.y, z: size.z },
              pixels: capturePixelStats(),
            };
          });
        },
        undefined,
        (error) => {
          window.__MAP_SMOKE__ = { ready: false, error: String(error) };
        },
      );
    </script>
  </body>
</html>`;
}

function safeFile(root, requestPath) {
  const filename = path.resolve(root, requestPath.replace(/^\/+/, ""));
  return filename === root || filename.startsWith(`${root}${path.sep}`)
    ? filename
    : null;
}

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    let filename = null;
    let contentType = "application/octet-stream";

    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(viewerHtml());
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/three.module.js") {
      filename = threeModulePath;
      contentType = "text/javascript; charset=utf-8";
    } else if (url.pathname.startsWith("/three.")) {
      filename = safeFile(threeBuildDirectory, url.pathname);
      contentType = "text/javascript; charset=utf-8";
    } else if (url.pathname.startsWith("/addons/")) {
      filename = safeFile(
        threeAddonsDirectory,
        url.pathname.slice("/addons/".length),
      );
      contentType = "text/javascript; charset=utf-8";
    } else if (url.pathname.startsWith("/assets/")) {
      filename = safeFile(
        assetDirectory,
        url.pathname.slice("/assets/".length),
      );
      contentType = "model/gltf-binary";
    }

    if (
      !filename ||
      !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()
    ) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": contentType });
    fs.createReadStream(filename).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Map GLB smoke server did not return a TCP address"));
        return;
      }
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function main() {
  fs.rmSync(evidenceDirectory, { recursive: true, force: true });
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const executablePath = findBrowserExecutable();
  assert(
    fs.existsSync(executablePath),
    "Chrome/Chromium is unavailable for the map GLB smoke test",
  );

  const { server, origin } = await startServer();
  let browser;

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu-sandbox",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
        "--use-gl=angle",
      ],
    });

    for (const [variant, expectedTerritories] of Object.entries(variants)) {
      for (const [viewportName, viewport] of Object.entries(viewports)) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("requestfailed", (request) => {
          errors.push(
            `${request.url()}: ${request.failure()?.errorText || "request failed"}`,
          );
        });
        page.on("response", (response) => {
          if (response.status() >= 400)
            errors.push(`${response.status()} ${response.url()}`);
        });

        await page.goto(`${origin}/?variant=${variant}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        try {
          await page.waitForFunction(
            () => window.__MAP_SMOKE__?.ready === true,
            null,
            {
              timeout: 30000,
            },
          );
        } catch (error) {
          const state = await page.evaluate(() => window.__MAP_SMOKE__ || null);
          throw new Error(
            `${variant}/${viewportName} did not render: ${JSON.stringify(state)}; ${errors.join("; ")}; ${error.message}`,
          );
        }
        const result = await page.evaluate(() => window.__MAP_SMOKE__);
        assert(
          errors.length === 0,
          `${variant}/${viewportName} browser errors: ${errors.join("; ")}`,
        );
        assert(
          result.territoryCount === expectedTerritories,
          `${variant} mesh count drifted`,
        );
        assert(
          result.metadataCount === expectedTerritories,
          `${variant} metadata count drifted`,
        );
        assert(
          result.uniqueNames === expectedTerritories,
          `${variant} mesh names are not unique`,
        );
        assert(
          result.bounds.x > 13 && result.bounds.z > 8,
          `${variant} board bounds are incomplete`,
        );
        assert(
          result.bounds.y >= 0.079 && result.bounds.y <= 0.081,
          `${variant} extrusion drifted`,
        );
        assert(
          result.pixels.coloredRatio > 0.18,
          `${variant}/${viewportName} canvas is mostly blank`,
        );
        assert(
          result.pixels.colorBuckets > 24,
          `${variant}/${viewportName} canvas lacks color detail`,
        );

        const screenshot = path.join(
          evidenceDirectory,
          `${variant}-${viewportName}.png`,
        );
        await page.screenshot({ path: screenshot });
        await context.close();
        console.log(
          `rendered ${variant}/${viewportName}: ${result.territoryCount} territories, ${(result.pixels.coloredRatio * 100).toFixed(1)}% colored pixels, ${result.pixels.colorBuckets} color buckets`,
        );
      }
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  console.log(`screenshots: ${evidenceDirectory}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
