import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { ALL_TERRITORIES } from "../game/mapData";
import {
  MAP_SCENE_LABEL_ATLAS_COLUMNS,
  MAP_SCENE_LABEL_ATLAS_FORMAT,
  MAP_SCENE_LABEL_ATLAS_HEIGHT,
  MAP_SCENE_LABEL_ATLAS_ROWS,
  MAP_SCENE_LABEL_ATLAS_WIDTH,
  MAP_SCENE_LABEL_CELL_HEIGHT,
  MAP_SCENE_LABEL_CELL_WIDTH,
  type MapSceneLabelAtlasManifest,
} from "../game/mapSceneLabels";

const require = createRequire(import.meta.url);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../assets/game/map-3d");
const atlasFilename = "territory-labels.png";
const manifestFilename = "territory-labels.json";
const fontSource =
  "@expo-google-fonts/im-fell-english/400Regular/IMFellEnglish_400Regular.ttf";
const fontPath = require.resolve(fontSource);
const fontPixelSize = 30;
const checkOnly = process.argv.slice(2).includes("--check");

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function renderAtlas(fontBytes: Buffer): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: {
        width: MAP_SCENE_LABEL_ATLAS_WIDTH,
        height: MAP_SCENE_LABEL_ATLAS_HEIGHT,
      },
      deviceScaleFactor: 1,
    });
    const result = await page.evaluate(
      async ({
        columns,
        rows,
        cellWidth,
        cellHeight,
        width,
        height,
        fontData,
        pixelSize,
        labels,
      }) => {
        const face = new FontFace(
          "WorldDominationMap",
          `url(data:font/ttf;base64,${fontData})`,
        );
        await face.load();
        (
          document.fonts as FontFaceSet & {
            add(font: FontFace): void;
          }
        ).add(face);
        await document.fonts.ready;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to create label-atlas canvas");
        context.clearRect(0, 0, width, height);
        context.font = `${pixelSize}px WorldDominationMap`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineJoin = "round";
        context.miterLimit = 2;
        context.strokeStyle = "rgba(246, 232, 184, 0.94)";
        context.lineWidth = 4;
        context.fillStyle = "#4a3418";

        const maximumTextWidth = cellWidth - 16;
        for (const [index, label] of labels.entries()) {
          const measured = context.measureText(label);
          if (measured.width > maximumTextWidth) {
            throw new Error(
              `Territory label "${label}" is ${measured.width.toFixed(2)}px wide; maximum is ${maximumTextWidth}px`,
            );
          }
          const column = index % columns;
          const row = Math.floor(index / columns);
          if (row >= rows) {
            throw new Error(`Territory label atlas capacity exceeded at ${label}`);
          }
          const x = column * cellWidth + cellWidth / 2;
          const y = row * cellHeight + cellHeight / 2 + 1;
          context.strokeText(label, x, y, maximumTextWidth);
          context.fillText(label, x, y, maximumTextWidth);
        }

        return canvas.toDataURL("image/png");
      },
      {
        columns: MAP_SCENE_LABEL_ATLAS_COLUMNS,
        rows: MAP_SCENE_LABEL_ATLAS_ROWS,
        cellWidth: MAP_SCENE_LABEL_CELL_WIDTH,
        cellHeight: MAP_SCENE_LABEL_CELL_HEIGHT,
        width: MAP_SCENE_LABEL_ATLAS_WIDTH,
        height: MAP_SCENE_LABEL_ATLAS_HEIGHT,
        fontData: fontBytes.toString("base64"),
        pixelSize: fontPixelSize,
        labels: ALL_TERRITORIES.map((territory) => territory.name),
      },
    );
    return Buffer.from(result.slice(result.indexOf(",") + 1), "base64");
  } finally {
    await browser.close();
  }
}

async function writeAtomically(
  filename: string,
  data: string | Uint8Array,
): Promise<void> {
  const temporaryFilename = `${filename}.tmp`;
  await writeFile(temporaryFilename, data);
  await rename(temporaryFilename, filename);
}

async function assertCurrent(
  filename: string,
  expected: string | Uint8Array,
): Promise<void> {
  const actual = await readFile(filename).catch(() => null);
  const expectedBytes =
    typeof expected === "string" ? Buffer.from(expected) : Buffer.from(expected);
  if (!actual?.equals(expectedBytes)) {
    throw new Error(
      `${path.relative(process.cwd(), filename)} is missing or stale; run pnpm run map:labels`,
    );
  }
}

async function main(): Promise<void> {
  const fontBytes = await readFile(fontPath);
  const atlasBytes = await renderAtlas(fontBytes);
  const manifest: MapSceneLabelAtlasManifest = {
    format: MAP_SCENE_LABEL_ATLAS_FORMAT,
    contractVersion: 1,
    file: atlasFilename,
    sha256: sha256(atlasBytes),
    byteLength: atlasBytes.byteLength,
    width: MAP_SCENE_LABEL_ATLAS_WIDTH,
    height: MAP_SCENE_LABEL_ATLAS_HEIGHT,
    columns: MAP_SCENE_LABEL_ATLAS_COLUMNS,
    rows: MAP_SCENE_LABEL_ATLAS_ROWS,
    cellWidth: MAP_SCENE_LABEL_CELL_WIDTH,
    cellHeight: MAP_SCENE_LABEL_CELL_HEIGHT,
    font: {
      source: fontSource,
      sha256: sha256(fontBytes),
      family: "IM Fell English",
      pixelSize: fontPixelSize,
    },
    labels: ALL_TERRITORIES.map((territory, stableIndex) => ({
      territoryId: territory.id,
      displayName: territory.name,
      stableIndex,
    })),
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  const atlasPath = path.join(outputDirectory, atlasFilename);
  const manifestPath = path.join(outputDirectory, manifestFilename);

  if (checkOnly) {
    await assertCurrent(atlasPath, atlasBytes);
    await assertCurrent(manifestPath, manifestJson);
  } else {
    await mkdir(outputDirectory, { recursive: true });
    await writeAtomically(atlasPath, atlasBytes);
    await writeAtomically(manifestPath, manifestJson);
  }

  console.log(
    `${checkOnly ? "verified" : "wrote"} ${atlasFilename}: ${ALL_TERRITORIES.length} labels, ${atlasBytes.byteLength} bytes, sha256 ${manifest.sha256}`,
  );
}

void main().catch(async (error: unknown) => {
  await Promise.all([
    rm(path.join(outputDirectory, `${atlasFilename}.tmp`), { force: true }),
    rm(path.join(outputDirectory, `${manifestFilename}.tmp`), { force: true }),
  ]);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
