import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { environment: "node", env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_GOOGLE_MAPS_BROWSER_KEY: "" } },
} as any);
