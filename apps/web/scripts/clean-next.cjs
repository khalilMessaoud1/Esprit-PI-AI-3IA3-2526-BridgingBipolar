/* Remove stale Next.js output (fixes "Cannot find module './NNN.js'" after HMR / interrupted builds). */
const fs = require("fs");
const path = require("path");

const nextDir = path.join(__dirname, "..", ".next");
const cacheDir = path.join(__dirname, "..", "node_modules", ".cache");

for (const dir of [nextDir, cacheDir]) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("Removed:", dir);
  } catch (e) {
    console.warn("Skip (missing or in use):", dir);
  }
}
