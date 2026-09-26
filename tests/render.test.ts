import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth, wrapPainted } from "../src/render.js";
import { mastheadSubtitle } from "../src/demo-sections.js";
import { decidedByLine } from "../src/demo-class.js";

const INK = "\u001b[38;5;67m";
const GRAPHITE = "\u001b[38;5;242m";
const RESET = "\u001b[0m";

test("a colour code costs no columns", () => {
  assert.equal(visibleWidth(`${GRAPHITE}twelve chars${RESET}`), 12);
  assert.equal(visibleWidth("twelve chars"), 12);
});

test("a line that already fits keeps the spacing that aligns its label column", () => {
  const aligned = "  policy     CART or interpreter services";
  assert.deepEqual(wrapPainted(aligned, 78), [aligned]);
});

test("a long line wraps to the frame instead of punching through the rail", () => {
  const long =
    "     decided by the keyword rules (bedrock_unreachable), changes_a_previously_stated_fact";
  const lines = wrapPainted(long, 76);
  assert.ok(lines.length > 1, "the line was left to overflow");
  for (const line of lines) assert.ok(visibleWidth(line) <= 76, `${visibleWidth(line)} columns: ${line}`);
  assert.match(lines[1]!, /^ {7}\S/, "the continuation clears the indent it belongs to");
});

test("a wrapped line carries its colour onto the next line rather than dropping it", () => {
  const lines = wrapPainted(`  ${GRAPHITE}${"word ".repeat(30).trim()}${RESET}`, 40);
  assert.ok(lines.length > 1);
  assert.ok(lines[0]!.endsWith(RESET), "the first line closes the colour it opened");
  assert.ok(lines[1]!.includes(GRAPHITE), "the second line re-opens it");
});

test("a single word wider than the frame is cut rather than allowed to overrun it", () => {
  const hash = "a".repeat(200);
  for (const line of wrapPainted(`  hash ${hash}`, 60)) {
    assert.ok(visibleWidth(line) <= 60, `${visibleWidth(line)} columns`);
  }
});

test("a word carrying escape sequences is never cut in half", () => {
  const painted = `${INK}${"x".repeat(120)}${RESET}`;
  const lines = wrapPainted(`  ${painted}`, 40);
  const rejoined = lines.join("");
  assert.equal((rejoined.match(/\u001b\[38;5;67m/g) ?? []).length, 1, "the colour was split across a cut");
});

test("the masthead does not claim a model answered on a run that has not happened yet", () => {
  const live = mastheadSubtitle(false);
  // It used to read "Bedrock live for classification only" whenever --offline was absent,
  // which on an unreachable network was the one false line on the screen.
  assert.doesNotMatch(live, /\blive\b/i);
  assert.match(live, /every row names what decided it/);
  assert.match(mastheadSubtitle(true), /Bedrock switched off/);
});

test("what actually decided the class is stated afterwards, with the reason when nothing did", () => {
  assert.equal(
    decidedByLine(9, 0, "bedrock_unreachable"),
    "Bedrock decided none of them (bedrock_unreachable). All 9 were decided by the keyword rules.",
  );
  assert.equal(decidedByLine(9, 9, null), "All 9 were decided by Bedrock.");
  assert.match(decidedByLine(9, 4, null), /^4 of the 9 captures were decided by Bedrock/);
});
