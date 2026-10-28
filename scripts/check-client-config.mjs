import { loadEnv } from "vite";
const env = loadEnv("production", process.cwd(), "");
const url = env.VITE_SUPABASE_URL?.trim(),
  key = env.VITE_SUPABASE_ANON_KEY?.trim();
if (Boolean(url) !== Boolean(key))
  throw Error(
    "Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or leave both empty for demo mode.",
  );
if (key) {
  if (key.startsWith("sb_secret_"))
    throw Error(
      "A server secret must never be used as the browser Supabase key. Use the publishable or legacy anon key.",
    );
  if (key.split(".").length === 3) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      throw Error("The Supabase browser key is malformed.");
    }
    if (role !== "anon")
      throw Error(
        "Use a legacy anon key, not a privileged JWT, in VITE_SUPABASE_ANON_KEY.",
      );
  } else if (!key.startsWith("sb_publishable_"))
    throw Error(
      "Unrecognized Supabase browser key. Use a publishable or legacy anon key.",
    );
  new URL(url);
}
console.log(
  `Client build mode: ${key ? "Supabase connected" : "local demo"}. Browser key safety check passed.`,
);
