const { readFile } = require("node:fs/promises");
const path = require("node:path");

const { validateBytes } = require("gltf-validator");

const assetDirectory = path.resolve(__dirname, "../assets/game/map-3d");
const filenames = ["world-map-classic.glb", "world-map-expanded.glb"];

async function main() {
  for (const filename of filenames) {
    const bytes = await readFile(path.join(assetDirectory, filename));
    const report = await validateBytes(new Uint8Array(bytes), {
      uri: filename,
      maxIssues: 1000,
    });
    const { numErrors, numWarnings, numInfos, numHints, messages } =
      report.issues;
    if (numErrors || numWarnings) {
      for (const issue of messages) {
        if (issue.severity <= 1) {
          console.error(
            `${filename}: ${issue.code} at ${issue.pointer || "/"}: ${issue.message}`,
          );
        }
      }
      throw new Error(
        `${filename} failed Khronos validation with ${numErrors} errors and ${numWarnings} warnings`,
      );
    }
    console.log(
      `validated ${filename}: ${numErrors} errors, ${numWarnings} warnings, ${numInfos} infos, ${numHints} hints`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
