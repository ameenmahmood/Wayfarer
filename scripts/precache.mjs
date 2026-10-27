import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const assets = readdirSync("dist/assets")
  .filter((n) => /\.(js|css)$/.test(n))
  .map((n) => "/assets/" + n);
writeFileSync(
  "dist/sw.js",
  readFileSync("public/sw.js", "utf8").replace(
    /\/\*PRECACHE\*\/\s*\[\]/,
    JSON.stringify(["/", "/manifest.webmanifest", ...assets]),
  ),
);
console.log(`Offline shell: precaching ${assets.length} bundled assets.`);
