/**
 * The two surfaces, run for real.
 *
 * Everything else in `tests/` calls a function. These four spawn the commands a judge
 * types, because the three things they cover only go wrong outside the process: the width
 * the terminal reports, the colour a light terminal cannot show, and what readline does
 * when its input is a pipe rather than a person.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SGR = /\u001b\[[0-9;]*m/g;

function run(script: string, env: Record<string, string>, input?: string): string[] {
  return execFileSync(process.execPath, ["--import", "tsx", script, "--offline"], {
    cwd: ROOT,
    encoding: "utf8",
    input: input ?? "",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  }).split("\n");
}

const visible = (line: string): number => line.replace(SGR, "").length;

test("the frame is drawn to the terminal's width rather than to a constant", () => {
  // The whole run used to be byte-identical at 80, 100 and 200 columns.
  const narrow = run("src/demo.ts", { COLUMNS: "80", NO_COLOR: "1" });
  const wide = run("src/demo.ts", { COLUMNS: "104", NO_COLOR: "1" });
  assert.notDeepEqual(narrow, wide, "the output ignored the terminal");

  for (const [columns, lines] of [[80, narrow], [104, wide]] as const) {
    for (const line of lines) {
      assert.ok(visible(line) <= columns, `${visible(line)} columns at ${columns}: ${line}`);
    }
    const rules = lines.filter((l) => /^[┌├└]/.test(l)).map(visible);
    assert.ok(rules.length > 5, "the frame was not drawn");
    assert.deepEqual([...new Set(rules)], [columns], `the frame has more than one right edge at ${columns}`);
  }
});

test("nothing the room said is painted in a colour that assumes a dark terminal", () => {
  const lines = run("src/demo.ts", { SAID_OUT_LOUD_COLOR: "always", COLUMNS: "92" });
  const all = lines.join("\n");
  // Bright white is white on white. The block this app labels PRINTED FIRST ON PURPOSE
  // came out as nine blank lines on a cream ground, and so did the app's own title.
  assert.doesNotMatch(all, /\u001b\[97m/, "bright white is still being used");

  const announcement = lines.find((l) => l.includes("CHEM-201 has CART"));
  assert.ok(announcement, "the announcement is printed");
  const before = announcement.slice(0, announcement.indexOf("CHEM-201 has CART"));
  const codes = before.match(SGR) ?? [];
  assert.equal(
    codes[codes.length - 1],
    "\u001b[0m",
    "the announcement is painted rather than inheriting the terminal's own ink",
  );
});

test("the review queue answers every item it is fed, and says so at the end", () => {
  // tools/shoot.mjs drives this screen through a pipe, and readline's question() resolves
  // once on a pipe: the run answered one of nine and exited 0 with no summary at all.
  const lines = run("src/review-cli.ts", { COLUMNS: "92", NO_COLOR: "1" }, "y\nn\ny\ny\ny\nn\ny\ny\nn\n");
  const out = lines.join("\n");
  assert.match(out, /№ 09 of 9/, "the ninth item was never reached");
  assert.equal((out.match(/y\/n\/s\/q >/g) ?? []).length, 9, "nine prompts for nine items");
  assert.match(out, /^├─ DONE /m, "the summary never printed");
  assert.match(out, /6 confirmed, 3 rejected, 0 still pending\./);
  // The prompt has no trailing newline on a TTY, where the person's Enter supplies one.
  // On a pipe it has to be written, or the next rail lands mid-prompt.
  assert.doesNotMatch(out, /y\/n\/s\/q > *│/, "a rail landed in the middle of the prompt");
});

test("running out of answers ends the queue honestly instead of ending the process", () => {
  const lines = run("src/review-cli.ts", { COLUMNS: "92", NO_COLOR: "1" }, "y\nn\n");
  const out = lines.join("\n");
  assert.match(out, /no answer given; this and 6 after it are still pending/);
  assert.match(out, /^├─ DONE, WITH THE QUEUE UNFINISHED /m);
  assert.match(out, /7 still pending\./);
});
