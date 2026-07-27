import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

// The title screen shows the build version. Read it from package.json so the
// two can never drift — bump the version there and the title follows.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// The Claude preview harness assigns a free port via the PORT env var (autoPort
// in .claude/launch.json). Vite doesn't read PORT on its own, so bind to it here
// and fall back to 5173 for a plain `npm run dev`.
export default defineConfig(({ command }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Cloudflare Pages serves this project at the site root and injects CF_PAGES
  // during builds. Keep the /matchBlade/ base for the existing GitHub Pages
  // deploy script, while local dev and Cloudflare both use /.
  base: command === "build" && !process.env.CF_PAGES ? "/matchBlade/" : "/",
  server: {
    host: true, // listen on the LAN too, so a phone on the same Wi-Fi can play the dev build
    port: Number(process.env.PORT) || 5173,
    watch: {
      // Never watch the raw art/audio source tree — it's not served (only public/ is),
      // it's huge, and a locked file there (e.g. an .ogg held by another process) crashes
      // the chokidar watcher with EBUSY and takes the whole dev server down.
      ignored: ["**/assets/**"],
    },
  },
}));
