/**
 * Publish dist/ to the gh-pages branch — the GitHub Pages source.
 * Run via `npm run deploy` (builds first). Uses a throwaway git repo inside
 * dist/ and force-pushes, so master history stays clean and dist/ stays
 * gitignored. Auth rides the machine's normal git credential helper (gh).
 *
 * (A push-triggered Actions workflow would be nicer, but the current gh
 * token lacks the `workflow` scope to push workflow files — run
 * `gh auth refresh -s workflow` if you ever want to switch over.)
 */
import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const REMOTE = "https://github.com/cosmonautJoe/matchBlade.git";
const run = (cmd) => execSync(cmd, { cwd: "dist", stdio: "inherit" });

writeFileSync("dist/.nojekyll", ""); // serve files verbatim — no Jekyll pass
rmSync("dist/.git", { recursive: true, force: true }); // stale repo from a prior run
run("git init -b gh-pages");
run("git add -A");
run('git commit -m "Deploy to GitHub Pages"');
run(`git push -f ${REMOTE} gh-pages`);
rmSync("dist/.git", { recursive: true, force: true });
console.log("\nDeployed -> https://cosmonautjoe.github.io/matchBlade/ (allow a minute to go live)");
