/**
 * Bump the game's version in package.json.
 *
 * The title screen reads this through vite's `define` (see vite.config.ts), so
 * this one number is the whole version story — there is nothing else to edit.
 *
 * Usage:
 *   npm run bump          # 0.0.6 -> 0.0.7   (the normal case)
 *   npm run bump minor    # 0.0.6 -> 0.1.0
 *   npm run bump major    # 0.0.6 -> 1.0.0
 *
 * Deliberately does NOT touch git: no commit, no tag. `npm version` does both
 * and that fights the way this repo commits (one commit per batch of work, and
 * `npm run deploy` force-pushes dist/ to gh-pages separately).
 */
import { readFileSync, writeFileSync } from "node:fs";

const KINDS = ["patch", "minor", "major"];
const kind = process.argv[2] ?? "patch";
if (!KINDS.includes(kind)) {
  console.error(`usage: npm run bump [${KINDS.join("|")}]`);
  process.exit(1);
}

const path = new URL("../package.json", import.meta.url);
const raw = readFileSync(path, "utf8");
const pkg = JSON.parse(raw);

const parts = String(pkg.version).split(".").map((n) => Number.parseInt(n, 10));
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`package.json version is not x.y.z: ${pkg.version}`);
  process.exit(1);
}
let [major, minor, patch] = parts;
if (kind === "major") [major, minor, patch] = [major + 1, 0, 0];
else if (kind === "minor") [minor, patch] = [minor + 1, 0];
else patch += 1;

const next = `${major}.${minor}.${patch}`;
// Rewrite just the version line so the file's formatting survives untouched.
const out = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
if (out === raw) {
  console.error("could not find the version field to rewrite");
  process.exit(1);
}
writeFileSync(path, out);
console.log(`v${pkg.version} -> v${next}`);
