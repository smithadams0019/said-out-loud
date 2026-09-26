/**
 * Photograph the REPL actually running: the banner, tab completion firing for real
 * (both a command name and a row id), and commands producing real output — not the
 * scripted `demo.ts`/`review-cli.ts` runs `tools/shoot.mjs` already covers.
 *
 * Tab completion only activates when stdin is a real terminal (`readline` falls back to
 * dumb line input otherwise, and a literal Tab character gets typed rather than
 * triggering the completer), so this drives the REPL under an actual pty via `script`
 * (util-linux) rather than piping input. Row ids are random per run
 * (`randomUUID().slice(0, 8)`), so the second session's keystrokes are built from what
 * the first session's real output actually printed, not guessed at.
 *
 *   node tools/shoot-repl.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, globSync } from "node:fs";

const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;
const HOME = `${ROOT}/.said-out-loud-repl-shoot`;

// The palette from src/render.ts, both themes, in the same words the spec uses.
const DARK = {
  "38;5;67": "#5f87af", // ink
  "38;5;242": "#8a8a8a", // graphite
  "38;5;108": "#87af87", // moss
  "38;5;131": "#af5f5f", // clay
  "38;5;140": "#af87d7", // heather
};
const LIGHT = {
  "38;5;25": "#005faf", // ink
  "38;5;240": "#585858", // graphite
  "38;5;65": "#5f875f", // moss
  "38;5;124": "#af0000", // clay
  "38;5;97": "#875faf", // heather
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ansiToHtml(text, colours) {
  let out = "";
  let open = 0;
  for (const chunk of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = chunk.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) { out += esc(chunk); continue; }
    const code = m[1];
    if (code === "0" || code === "") { out += "</span>".repeat(open); open = 0; }
    else if (code === "1") { out += '<span style="font-weight:700">'; open += 1; }
    else if (colours[code]) { out += `<span style="color:${colours[code]}">`; open += 1; }
  }
  return out + "</span>".repeat(open);
}

function page(body, light) {
  const bg = light ? "#f6f3ec" : "#12151a";
  const fg = light ? "#1d1f24" : "#c8ccd4";
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:${bg}}
pre{margin:0;padding:28px 30px;color:${fg};background:${bg};
    font:14px/1.5 "DejaVu Sans Mono","Liberation Mono",monospace;white-space:pre}
</style><pre>${body}</pre>`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs the REPL under a real pty (`script -qec`, not a pipe) so Tab actually reaches
 * readline's completer, sends each step's bytes with a pause after, and returns
 * everything the pty wrote — including readline's own echo of what Tab completed. */
async function runPtySession(env, steps) {
  const child = spawn("script", ["-qec", "npx tsx src/repl.ts", "/dev/null"], {
    cwd: ROOT,
    env: { ...process.env, ...env, TERM: "xterm-256color" },
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d.toString("utf8"); });
  child.stderr.on("data", (d) => { output += d.toString("utf8"); });

  await wait(1200); // banner (tsx's first run compiles, so this one is slower than node)
  for (const [send, pause] of steps) {
    child.stdin.write(send);
    await wait(pause);
  }
  await wait(400);
  try { child.stdin.end(); } catch {}
  await wait(300);
  try { child.kill("SIGKILL"); } catch {}
  return output;
}

async function shootRaw(tab, name, raw, light) {
  const clean = raw
    .replace(/\x1b\][^\x07]*\x07/g, "") // OSC title sequences
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, (m) => (m[m.length - 1] === "m" ? m : "")) // non-SGR CSI (cursor moves, erases) — SGR kept for ansiToHtml
    .replace(/\r/g, "");
  const html = ansiToHtml(clean, light ? LIGHT : DARK);
  const lineCount = clean.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").split("\n").length;
  await tab.setViewportSize({ width: 1180, height: Math.max(220, lineCount * 21 + 58) });
  await tab.setContent(page(html, light));
  await tab.screenshot({ path: `${OUT}${name}.png` });
  console.log(`wrote ${name}.png (${lineCount} lines)`);
}

rmSync(HOME, { recursive: true, force: true });

const browser = await chromium.launch({
  executablePath: globSync(`${process.env.HOME}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`)[0],
  args: ["--no-sandbox"],
});
const tab = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
mkdirSync(OUT, { recursive: true });

const baseEnv = { SAID_OUT_LOUD_BEDROCK: "off", SAID_OUT_LOUD_COLOR: "always", SAID_OUT_LOUD_HOME: HOME, COLUMNS: "100" };

// Session 1: banner, `pol<TAB>` completing to `policies`, then `open` and `play` —
// the class arriving with the classifier getting some of it wrong, live.
const session1 = await runPtySession(baseEnv, [
  ["pol", 200],
  ["\t", 300],
  ["\n", 500],
  ["open", 150],
  ["\n", 500],
  ["play", 150],
  ["\n", 1500],
  ["queue", 150],
  ["\n", 400],
  ["exit", 100],
  ["\n", 200],
]);
await shootRaw(tab, "repl-01-banner-tab-complete-policies-open-play-queue", session1, false);

// A row id from what session 1 actually captured, not guessed at — ids are
// `item_<8 random hex chars>` per run.
const rowId = session1.match(/id (item_[a-f0-9]{8})/)?.[1];
if (!rowId) throw new Error("no captured row id found in session 1's output");

// Session 2, same store: `conf<TAB>` completing to `confirm`, then a partial row id
// `<TAB>` completing the argument, then `find` and `certificate` — real output on
// both, and the certificate is the app's own exportable, hash-chained artefact.
const needle = "moved";
const session2 = await runPtySession(baseEnv, [
  ["conf", 200],
  ["\t", 250],
  [rowId.slice(0, 10), 150],
  ["\t", 300],
  ["\n", 500],
  [`find ${needle}`, 150],
  ["\n", 400],
  ["certificate", 150],
  ["\n", 500],
  ["exit", 100],
  ["\n", 200],
]);
await shootRaw(tab, "repl-02-argument-completion-confirm-find-certificate", session2, false);

// Same first session, on a light terminal.
const session3 = await runPtySession({ ...baseEnv, SAID_OUT_LOUD_HOME: `${HOME}-light`, SAID_OUT_LOUD_THEME: "light" }, [
  ["pol", 200],
  ["\t", 300],
  ["\n", 500],
  ["open", 150],
  ["\n", 500],
  ["play", 150],
  ["\n", 1500],
  ["exit", 100],
  ["\n", 200],
]);
await shootRaw(tab, "repl-03-light-terminal", session3, true);

await browser.close();
rmSync(HOME, { recursive: true, force: true });
rmSync(`${HOME}-light`, { recursive: true, force: true });
