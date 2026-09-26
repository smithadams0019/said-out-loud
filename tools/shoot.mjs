/**
 * Turn the app's own terminal output into PNGs for the submission.
 *
 * Said Out Loud has no browser UI, so a screenshot is a picture of the terminal. This
 * runs the real commands, converts their ANSI output to HTML in the same palette the
 * app prints, and photographs it. Nothing here is mocked up: what you see is what the
 * command wrote.
 *
 *   node tools/shoot.mjs            uses Bedrock
 *   node tools/shoot.mjs --offline  forces the rules classifier
 */

import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const OFFLINE = process.argv.includes("--offline");

// The palette from src/render.ts, in the same words the spec uses. What the room said
// carries no code at all — it takes the page's own foreground below, the same way it
// takes the terminal's — so there is no entry for it here.
const COLOURS = {
  "38;5;67": "#5f87af", // ink blue
  "38;5;242": "#8a8a8a", // graphite
  "38;5;108": "#87af87", // moss
  "38;5;131": "#af5f5f", // clay
  "38;5;140": "#af87d7", // heather
};

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Minimal ANSI SGR to HTML. Handles exactly the codes render.ts emits. */
function ansiToHtml(text) {
  let out = "";
  let open = 0;
  for (const chunk of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = chunk.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) {
      out += esc(chunk);
      continue;
    }
    const code = m[1];
    if (code === "0" || code === "") {
      out += "</span>".repeat(open);
      open = 0;
    } else if (code === "1") {
      out += '<span style="font-weight:700">';
      open += 1;
    } else if (COLOURS[code]) {
      out += `<span style="color:${COLOURS[code]}">`;
      open += 1;
    }
  }
  return out + "</span>".repeat(open);
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  html,body{margin:0;background:#12151a}
  pre{margin:0;padding:28px 30px;color:#c8ccd4;background:#12151a;
      font:14px/1.5 "DejaVu Sans Mono","Liberation Mono",monospace;white-space:pre}
</style><pre>${body}</pre>`;
}

function run(args, input) {
  return execFileSync("npx", ["tsx", ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    input,
    env: { ...process.env, SAID_OUT_LOUD_COLOR: "always" },
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function shoot(tab, name, title, lines) {
  const body = [...lines];
  while (body.length && body[body.length - 1].replace(/\x1b\[[0-9;]*m/g, "").trim() === "\u2502") body.pop();
  if (body.length < 2) return;
  await tab.setViewportSize({ width: 1180, height: Math.max(220, body.length * 21 + 58) });
  await tab.setContent(page(title, ansiToHtml(body.join("\n"))));
  await tab.screenshot({ path: `${OUT}${name}.png` });
  console.log(`wrote ${name}.png (${body.length} lines)`);
}

/**
 * The shots are the app's own sections, found by the rule it draws between them, so a
 * change to the demo changes the screenshots rather than silently desyncing from them.
 */
function sectionsOf(lines) {
  const starts = [];
  lines.forEach((line, i) => {
    if (line.includes("\u251c\u2500 ")) starts.push(i);
  });
  const shots = [{ name: "00-header", title: "Said Out Loud", from: 0, to: starts[0] ?? lines.length }];
  starts.forEach((from, i) => {
    const to = starts[i + 1] ?? lines.length;
    const title = lines[from].replace(/\x1b\[[0-9;]*m/g, "").replace(/^\u251c\u2500 /, "").replace(/\s*\u2500+\s*$/, "");
    shots.push({
      name: `${String(i + 1).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 44)}`,
      title,
      from,
      to,
    });
  });
  return shots;
}

const browser = await chromium.launch({
  executablePath: globSync(`${process.env.HOME}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`)[0],
  args: ["--no-sandbox"],
});
const tab = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
mkdirSync(OUT, { recursive: true });

const args = ["src/demo.ts", "--print-certificate"];
if (OFFLINE) args.push("--offline");
const output = run(args).split("\n");
writeFileSync(`${OUT}../demo-output.txt`, output.join("\n"));

for (const shot of sectionsOf(output)) {
  await shoot(tab, shot.name, shot.title, output.slice(shot.from, shot.to));
}

// The second surface: the student's queue, answered y / n / y / y and then left.
const reviewArgs = ["src/review-cli.ts"];
if (OFFLINE) reviewArgs.push("--offline");
const review = run(reviewArgs, "y\nn\ny\ny\nq\n").split("\n");
writeFileSync(`${OUT}../review-output.txt`, review.join("\n"));
await shoot(tab, "09-review-screen", "The student's review screen", review.slice(0, 40));

await browser.close();
