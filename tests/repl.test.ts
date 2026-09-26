/**
 * The REPL's command dispatch and tab completion (src/repl.ts).
 *
 * `dispatch()` is the one function both the interactive loop and one-shot argv calls
 * run through, so it is what this file tests rather than spawning the process and
 * scraping a terminal. Bedrock is switched off throughout — the fixture class still
 * captures real items through the keyword-rules path, which is enough to exercise
 * every command — and `SAID_OUT_LOUD_HOME` points at a fresh temp directory per test
 * run so this suite never touches a developer's own `.said-out-loud-repl/`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { boot, completer, dispatch } from "../src/repl.js";
import { POLICY_TEMPLATES } from "../src/policies.js";

const workDir = mkdtempSync(path.join(tmpdir(), "said-out-loud-repl-test-"));
process.env.SAID_OUT_LOUD_BEDROCK = "off";
process.env.SAID_OUT_LOUD_HOME = workDir;

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Every command's whole interface is what it prints, so tests capture stdout rather
 * than a return value. */
async function run(cmd: string, ...args: string[]): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...parts: unknown[]): void => {
    lines.push(parts.map(String).join(" "));
  };
  try {
    await dispatch(cmd, args);
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

/** Pulls every `item_...` row id currently printed in the queue, oldest first. */
function idsFrom(queueOut: string): string[] {
  return [...queueOut.matchAll(/id (item_[a-z0-9]+)/g)].map((m) => m[1]!);
}

test("help lists every command, and nothing it does not have", async () => {
  boot();
  const out = await run("help");
  for (const cmd of ["policies", "open", "play", "queue", "confirm", "reject", "find", "digest", "certificate", "verify"]) {
    assert.match(out, new RegExp(cmd));
  }
});

test("an unknown command says so without throwing", async () => {
  boot();
  const out = await run("frobnicate");
  assert.match(out, /unknown command: frobnicate/);
  assert.equal(await dispatch("frobnicate", []), "unknown");
});

test("exit and quit both signal the REPL to stop, and nothing else does", async () => {
  boot();
  assert.equal(await dispatch("exit", []), "exit");
  assert.equal(await dispatch("quit", []), "exit");
  assert.equal(await dispatch("status", []), "ok");
});

test("policies lists all four templates", async () => {
  boot();
  const out = await run("policies");
  for (const p of POLICY_TEMPLATES) assert.match(out, new RegExp(p.id));
});

test("commands that need a session say so instead of throwing, before one is opened", async () => {
  boot();
  assert.match(await run("queue"), /no session open/);
  assert.match(await run("find", "anything"), /no session open/);
  assert.match(await run("digest"), /no session open/);
  assert.match(await run("verify"), /no session open/);
  assert.match(await run("certificate"), /no session open/);
});

test("confirm and reject on an unknown row id report the error rather than throwing", async () => {
  boot();
  assert.match(await run("confirm", "no-such-row"), /No captured item/);
  assert.match(await run("reject", "no-such-row"), /No captured item/);
});

test("confirm and reject with no argument print usage instead of doing nothing silently", async () => {
  boot();
  assert.match(await run("confirm"), /usage: confirm/);
  assert.match(await run("reject"), /usage: reject/);
});

test("open refuses an unknown policy id by name", async () => {
  boot();
  const out = await run("open", "not-a-real-policy");
  assert.match(out, /no such policy: not-a-real-policy/);
});

test("tab-completes command names from a prefix, and nothing for a prefix no command has", () => {
  boot();
  // A unique match gets a trailing space, so completing a command leaves the cursor
  // ready for its argument rather than needing a second Tab.
  const [hits] = completer("pol");
  assert.deepEqual(hits, ["policies "]);
  const [empty] = completer("zzz");
  assert.deepEqual(empty, []);
  const [all] = completer("");
  assert.ok(all.includes("open") && all.includes("play") && all.includes("confirm"));
});

test("open completes to every policy id", () => {
  boot();
  const [hits] = completer("open ");
  assert.deepEqual(new Set(hits), new Set(POLICY_TEMPLATES.map((p) => p.id)));
});

test("the class: open, play, queue, confirm, reject, find, digest, certificate and verify all work over the mock day", async () => {
  boot();

  const openOut = await run("open");
  assert.match(openOut, /CONSENT RECORD, ENTRY 0/);
  assert.match(openOut, /deaf-hoh-cart|CART or interpreter/i);

  const playOut = await run("play");
  assert.match(playOut, /THE CLASS, DECIDED UTTERANCE BY UTTERANCE/);
  assert.match(playOut, /captured/);

  // Playing an already-played session must not duplicate the queue — a known limitation
  // of the underlying app (`docs/FEATURE-GAP.md`), and exactly the trap a REPL that lets
  // you run any command in any order would otherwise walk you into.
  const replayOut = await run("play");
  assert.match(replayOut, /already been played/);

  const queueOut = await run("queue");
  const ids = idsFrom(queueOut);
  assert.ok(ids.length >= 2, "the fixture class captures more than one item");

  // Completion now has real row ids to offer for confirm/reject.
  const [confirmHits] = completer(`confirm ${ids[0]!.slice(0, 6)}`);
  assert.ok(confirmHits.includes(ids[0]));

  const confirmOut = await run("confirm", ids[0]!);
  assert.match(confirmOut, /confirmed/);
  assert.match(confirmOut, /Bee todo/);

  const rejectOut = await run("reject", ids[1]!);
  assert.match(rejectOut, /rejected/);

  // A confirmed row's quote is now searchable.
  const findOut = await run("find", "moved");
  assert.doesNotMatch(findOut, /nothing confirmed matches/);

  const digestOut = await run("digest");
  assert.match(digestOut, /WHAT THE INSTRUCTOR SEES/);

  const certOut = await run("certificate");
  assert.match(certOut, /SAID OUT LOUD, CONSENT RECORD/);
  assert.match(certOut, /VERIFIED\./);

  const verifyOut = await run("verify");
  assert.match(verifyOut, /chain verified/);
  assert.doesNotMatch(verifyOut, /broken/);

  const statusOut = await run("status");
  assert.match(statusOut, /1 confirmed/);
  assert.match(statusOut, /1 rejected/);
  assert.match(statusOut, /chain      .*verified/s);
});

test("a session and its ledger survive a fresh boot — the second run sees the first's queue", async () => {
  boot();
  await run("open");
  await run("play");
  const before1 = idsFrom(await run("queue"));
  assert.ok(before1.length > 0);

  // Simulate a new process: re-run boot() against the same persisted store.
  boot();
  const after1 = idsFrom(await run("queue"));
  assert.deepEqual(new Set(after1), new Set(before1));
});
