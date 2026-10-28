import { loadEnv } from "vite";
const env = loadEnv("production", process.cwd(), "");
const base = env.VITE_SUPABASE_URL?.replace(/\/$/, ""),
  key = env.VITE_SUPABASE_ANON_KEY;
if (!base || !key) throw Error("Supabase public configuration is missing.");
const origin =
  process.env.WAYFARER_SITE_ORIGIN || "https://ameenmahmood.github.io";
const settings = await fetch(base + "/auth/v1/settings", {
  headers: { apikey: key },
  signal: AbortSignal.timeout(12000),
});
const auth = await settings.json();
console.log(
  JSON.stringify({
    check: "auth endpoint",
    status: settings.status,
    emailEnabled: auth.external?.email,
    signupDisabled: auth.disable_signup,
  }),
);
const options = await fetch(base + "/functions/v1/travel-services", {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,apikey,content-type",
  },
  signal: AbortSignal.timeout(12000),
});
console.log(
  JSON.stringify({
    check: "Edge Function CORS",
    status: options.status,
    originMatches:
      options.headers.get("access-control-allow-origin") === origin,
  }),
);
const blocked = await fetch(base + "/functions/v1/travel-services", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin, apikey: key },
  body: JSON.stringify({
    action: "places",
    tripId: "11111111-1111-4111-8111-111111111111",
    query: "test",
  }),
  signal: AbortSignal.timeout(12000),
});
console.log(
  JSON.stringify({
    check: "anonymous Edge Function denied",
    status: blocked.status,
    passed: blocked.status === 401,
  }),
);
const data = await fetch(base + "/rest/v1/entities?select=id&limit=1", {
  headers: { apikey: key, Authorization: "Bearer " + key },
  signal: AbortSignal.timeout(12000),
});
const rows = await data.json();
const anonymousDataDenied =
  data.status === 401 ||
  data.status === 403 ||
  (Array.isArray(rows) && rows.length === 0);
console.log(
  JSON.stringify({
    check: "anonymous trip read denied",
    status: data.status,
    passed:
      data.status === 401 ||
      data.status === 403 ||
      (Array.isArray(rows) && rows.length === 0),
  }),
);
if (
  settings.status !== 200 ||
  !auth.external?.email ||
  options.status !== 200 ||
  options.headers.get("access-control-allow-origin") !== origin ||
  blocked.status !== 401 ||
  !anonymousDataDenied
)
  process.exitCode = 1;
