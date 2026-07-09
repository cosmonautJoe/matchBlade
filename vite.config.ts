import { defineConfig } from "vite";

// The Claude preview harness assigns a free port via the PORT env var (autoPort
// in .claude/launch.json). Vite doesn't read PORT on its own, so bind to it here
// and fall back to 5173 for a plain `npm run dev`.
export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
