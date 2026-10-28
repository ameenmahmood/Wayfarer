import { loadEnv } from "vite";
import { spawnSync } from "node:child_process";
import "./check-client-config.mjs";
const env = loadEnv("production", process.cwd(), "");
for (const name of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_GOOGLE_MAPS_BROWSER_KEY",
]) {
  const value = env[name]?.trim();
  if (!value) continue;
  const result = spawnSync(
    "gh",
    ["variable", "set", name, "--repo", "ameenmahmood/Wayfarer"],
    { input: value, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw Error(`Could not set public GitHub build variable ${name}.`);
  console.log(
    `Configured ${name} (public client configuration; value not printed).`,
  );
}
