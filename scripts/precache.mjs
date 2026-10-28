import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const base = process.env.VITE_BASE_PATH || "/";
const assets = readdirSync("dist/assets")
  .filter((n) => /\.(js|css)$/.test(n))
  .map((n) => base + "assets/" + n);
writeFileSync(
  "dist/sw.js",
  readFileSync("public/sw.js", "utf8").replace(
    /\/\*PRECACHE\*\/\s*\[\]/,
    JSON.stringify([base, base + "manifest.webmanifest", ...assets]),
  ),
);
console.log(`Offline shell: precaching ${assets.length} bundled assets.`);
