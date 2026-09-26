#!/usr/bin/env node
/**
 * Said Out Loud's REPL — `npm run repl`, or one command straight from the shell:
 * `node src/repl.ts find "problem set"`.
 *
 * `npm run demo` plays one class start to finish and exits; `npm run review` is a
 * single y/n/s/q pass over one queue. This is the shape between them: open a session,
 * let the class run, work the review queue at your own pace, search what you and past
 * sessions of the course confirmed, and pull the consent certificate — all in the same
 * process, in whatever order you actually do it in.
 *
 * The commands are drawn from what a *student* does with this app afterwards, not from
 * a generic CLI vocabulary: `open`, `play`, `queue`, `confirm`, `reject`, `find`,
 * `digest`, `certificate`, `verify`. A sibling Bee project's REPL is a decision log
 * that ends in a git commit, with a deliberately different command set, because that
 * separation matters more there than it would here.
 *
 * The look is this app's own: `render.ts`'s ledger rail and five-colour palette
 * (INK/GRAPHITE/MOSS/CLAY/HEATHER), nothing new added to it. The rail opens once at the
 * banner and does not close until `exit`, so the whole REPL session reads as one
 * continuous ledger page rather than a new box per command.
 */
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MockBeeClient } from "./bee-client.js";
import { defaultCaller } from "./classifier.js";
import { openChain, verifyChain } from "./chain.js";
import { endSession, startSessionFromPolicy } from "./consent.js";
import { printChainVerdict, printConsentRecord, printDigest } from "./demo-sections.js";
import { replayClass } from "./demo-class.js";
import { roomDigest } from "./digest.js";
import { renderConsentCertificate } from "./export.js";
import { loadSessionTranscript } from "./fixtures.js";
import { findPolicy, POLICY_TEMPLATES } from "./policies.js";
import { confirmItem, pendingItems, rejectItem, reviewStats } from "./review.js";
import {
  BOLD,
  CLAY,
  GRAPHITE,
  HEATHER,
  INK,
  MOSS,
  RESET,
  blank,
  entryNumber,
  foot,
  head,
  quoted,
  rail,
  section,
  sourceTag,
  stateTag,
  wrapped,
} from "./render.js";
import { defaultStorePath, SessionStore } from "./store.js";
import type { BedrockCaller } from "./bedrock.js";
import type { ChainEntry, Session } from "./types.js";

const DEFAULT_POLICY_ID = "deaf-hoh-cart";
const SESSION_MINUTES = 15;
const A_DAY = 86_400_000;

const COMMANDS = [
  "policies",
  "open",
  "play",
  "queue",
  "confirm",
  "reject",
  "find",
  "digest",
  "certificate",
  "verify",
  "status",
  "help",
  "clear",
  "exit",
  "quit",
] as const;

let store: SessionStore;
let bee: MockBeeClient;
let caller: BedrockCaller | null;
let storePath: string;
let session: Session | null = null;
let chain: ChainEntry[] = [];

function usage(name: string, args: string): void {
  rail(`  usage: ${INK}${name}${RESET} ${GRAPHITE}${args}${RESET}`);
  blank();
}

function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  rail(`  ${CLAY}error${RESET}  ${GRAPHITE}${message}${RESET}`);
  blank();
}

function needSession(): boolean {
  if (session) return true;
  rail(`  ${GRAPHITE}no session open — try ${RESET}${INK}open${RESET}`);
  blank();
  return false;
}

function banner(): void {
  head("SAID OUT LOUD", "The review queue stays open the whole session.");
  blank();
  rail(`  ${INK}help${RESET}   ${GRAPHITE}list every command${RESET}`);
  rail(`  ${INK}tab${RESET}    ${GRAPHITE}completes a command, a policy id, or a row waiting on you${RESET}`);
  rail(`  ${INK}ctrl+d${RESET} ${GRAPHITE}leave — nothing confirmed is lost, only what never got reviewed${RESET}`);
  blank();
}

function printHelp(): void {
  const cmd = (name: string, args: string, desc: string): void => {
    rail(`  ${INK}${name}${RESET}${args ? ` ${GRAPHITE}${args}${RESET}` : ""}`);
    rail(`    ${GRAPHITE}${desc}${RESET}`);
  };
  blank();
  cmd("policies", "", "list the institutional policy templates a session can open under");
  cmd("open", "[policyId]", `announce and open a session under a policy — ${DEFAULT_POLICY_ID} if none given`);
  cmd("play", "", "run the class through the pipeline; captures land in the queue as pending");
  cmd("queue", "", "everything captured and not yet judged, oldest first");
  cmd("confirm", "<rowId>", "yes, this was announced — creates its Bee todo, the only way one exists");
  cmd("reject", "<rowId>", "no, it was not — kept as a correction the classifier sees on later utterances");
  cmd("find", "<words>", "search every confirmed announcement across every session of this course");
  cmd("digest", "", "what the instructor would see: confirmed announcements, no name, no roster, no device");
  cmd("certificate", "", "the exportable consent record: the announcement, the policy, the full hash chain");
  cmd("verify", "", "check the consent chain has not been edited or reordered since it was written");
  cmd("status", "", "what is open, what is configured, and the queue counts");
  cmd("clear", "", "clear the screen");
  cmd("help", "", "this");
  cmd("exit", "", "leave (or Ctrl+D)");
  blank();
  rail(`  ${GRAPHITE}also runs one-shot from the shell: node src/repl.ts find "problem set"${RESET}`);
  blank();
}

async function ensureSession(): Promise<void> {
  if (!session) await doOpen([]);
}

async function doOpen(args: readonly string[]): Promise<void> {
  const policyId = args[0] ?? DEFAULT_POLICY_ID;
  const policy = findPolicy(policyId);
  if (!policy) {
    rail(`  ${GRAPHITE}no such policy: ${policyId} — try ${RESET}${INK}policies${RESET}`);
    blank();
    return;
  }
  if (session && !session.closed) {
    store.putSession(endSession(session, Date.now()));
  }
  const startMs = Date.now();
  const fixture = loadSessionTranscript(startMs);
  session = startSessionFromPolicy({
    policyTemplateId: policy.id,
    courseId: fixture.courseId,
    room: fixture.room,
    startMs,
    maxDurationMinutes: SESSION_MINUTES,
  });
  store.putSession(session);
  chain = openChain(session.consentRecord);
  store.chains.set(session.id, chain);
  store.putChainEntry(chain[0]!);
  printConsentRecord(policy, session.consentRecord, chain[0]!);
}

async function doPlay(): Promise<void> {
  await ensureSession();
  if (session!.closed) {
    rail(`  ${GRAPHITE}session ${session!.id} is closed — run ${RESET}${INK}open${RESET}${GRAPHITE} to start another${RESET}`);
    blank();
    return;
  }
  // A session resumed from the persisted store in a fresh process has no utterances
  // cached in memory; recomputed from its own startMs, which is deterministic, rather
  // than kept in a module variable that a process restart would lose anyway.
  if (store.ledgerFor(session!.id).length > 0) {
    rail(`  ${GRAPHITE}this session's class has already been played — its queue has ${store.ledgerFor(session!.id).length} row(s).${RESET}`);
    rail(`  ${GRAPHITE}playing it again would duplicate them; run ${RESET}${INK}open${RESET}${GRAPHITE} to start a fresh session instead.${RESET}`);
    blank();
    return;
  }
  const { utterances } = loadSessionTranscript(session!.startMs);
  await replayClass(session!, utterances, { caller, store });
}

function doQueue(): void {
  if (!needSession()) return;
  const pending = pendingItems(store, session!.id);
  if (pending.length === 0) {
    rail(`  ${GRAPHITE}nothing waiting on you — run ${RESET}${INK}play${RESET}${GRAPHITE} to bring the class in${RESET}`);
    blank();
    return;
  }
  section(`${pending.length} CAPTURED, WAITING ON YOU`);
  pending.forEach((row, i) => {
    rail(`${entryNumber(i + 1)}  ${row.category}   ${stateTag("pending")}`);
    quoted(row.quote);
    rail(`     ${sourceTag(row.source, row.fallbackReason, row.modelId)}${GRAPHITE}, ${row.rationale}${RESET}`);
    rail(`     ${GRAPHITE}id ${row.id}${RESET}`);
    blank();
  });
}

/**
 * A review timestamp deliberately later than the last chain entry, not `Date.now()`.
 * The fixture's utterances carry simulated offsets from the session's own start —
 * `play` can stamp `item_captured` entries minutes ahead of the wall clock — so a
 * `confirm` running moments later in real time would timestamp *before* them, and
 * `verifyChain`'s monotonicity check would correctly call that a broken chain. Reading
 * the actual last entry keeps this right across separate one-shot processes too, where
 * there is no shared in-memory clock to advance.
 */
function nextReviewMs(): number {
  const last = chain[chain.length - 1]?.atMs ?? session?.endMs ?? Date.now();
  return last + 1000;
}

async function doConfirm(args: readonly string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    usage("confirm", "<rowId>");
    return;
  }
  try {
    const { todo } = await confirmItem(store, bee, id, nextReviewMs());
    rail(`  ${stateTag("confirmed")} ${GRAPHITE}Bee todo ${todo.id}${RESET}`);
    wrapped(todo.text, "    ");
    blank();
  } catch (err) {
    printError(err);
  }
}

async function doReject(args: readonly string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    usage("reject", "<rowId>");
    return;
  }
  try {
    const row = rejectItem(store, id, nextReviewMs());
    rail(`  ${stateTag("rejected")} ${GRAPHITE}kept as a correction for ${row.courseId}${RESET}`);
    blank();
  } catch (err) {
    printError(err);
  }
}

function doFind(args: readonly string[]): void {
  if (!needSession()) return;
  const needle = args.join(" ").trim().toLowerCase();
  if (!needle) {
    usage("find", "<words>");
    return;
  }
  const rows = store
    .rowsForCourse(session!.courseId)
    .filter((r) => r.review === "confirmed")
    .filter((r) => r.quote.toLowerCase().includes(needle))
    .sort((a, b) => b.timestampMs - a.timestampMs);
  if (rows.length === 0) {
    rail(`  ${GRAPHITE}nothing confirmed matches that, across any session of ${session!.courseId}${RESET}`);
    blank();
    return;
  }
  section(`${rows.length} MATCH(ES) FOR "${needle}", ${session!.courseId}`);
  for (const row of rows) {
    rail(`  ${row.category}   ${GRAPHITE}${new Date(row.timestampMs).toISOString()}${RESET}`);
    quoted(row.quote, "    ");
  }
  blank();
}

function doDigest(): void {
  if (!needSession()) return;
  const digest = roomDigest(store, session!.courseId, session!.room, session!.startMs - A_DAY, session!.startMs + A_DAY);
  printDigest(digest);
}

function doCertificate(): void {
  if (!needSession()) return;
  console.log(
    renderConsentCertificate({
      consent: session!.consentRecord,
      chain,
      rows: store.ledgerFor(session!.id),
      courseId: session!.courseId,
      room: session!.room,
    }),
  );
}

function doVerify(): void {
  if (!needSession()) return;
  printChainVerdict(chain, session!.id);
}

function doPolicies(): void {
  section("POLICY TEMPLATES A SESSION CAN OPEN UNDER");
  for (const p of POLICY_TEMPLATES) {
    rail(`  ${BOLD}${p.id}${RESET}  ${GRAPHITE}${p.label}${RESET}`);
    rail(`    ${GRAPHITE}${p.basis}${RESET}`);
    rail(`    ${GRAPHITE}speakers ${p.expectedSpeakers.join(", ")}, retention ${p.retentionDays} days${RESET}`);
    blank();
  }
}

function doStatus(): void {
  section("STATUS");
  rail(`  bedrock    ${caller ? `${MOSS}configured${RESET}` : `${GRAPHITE}off — SAID_OUT_LOUD_BEDROCK=off, or no AWS identity${RESET}`}`);
  rail(`  store      ${GRAPHITE}${storePath}${RESET}`);
  if (session) {
    const stats = reviewStats(store.ledgerFor(session.id));
    const verdict = verifyChain(chain);
    rail(`  session    ${session.id}  ${session.closed ? `${CLAY}closed${RESET}` : `${MOSS}open${RESET}`}`);
    rail(`  course     ${session.courseId} in ${session.room}`);
    rail(`  captured   ${HEATHER}${stats.pending} pending${RESET}, ${MOSS}${stats.confirmed} confirmed${RESET}, ${CLAY}${stats.rejected} rejected${RESET}`);
    rail(`  chain      ${verdict.valid ? `${MOSS}verified${RESET}, ${verdict.entries} entries` : `${CLAY}broken at entry ${verdict.brokenAtIndex}${RESET}`}`);
  } else {
    rail(`  session    ${GRAPHITE}none open — try ${RESET}${INK}open${RESET}`);
  }
  blank();
}

function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

export type DispatchResult = "ok" | "exit" | "unknown";

/** Shared by the REPL loop and one-shot argv dispatch, so `node src/repl.ts find ...`
 * and typing `find ...` at the prompt run the identical handler. */
export async function dispatch(cmd: string, args: readonly string[]): Promise<DispatchResult> {
  try {
    switch (cmd) {
      case "help":
        printHelp();
        return "ok";
      case "clear":
        clearScreen();
        banner();
        return "ok";
      case "status":
        doStatus();
        return "ok";
      case "policies":
        doPolicies();
        return "ok";
      case "open":
        await doOpen(args);
        return "ok";
      case "play":
        await doPlay();
        return "ok";
      case "queue":
        doQueue();
        return "ok";
      case "confirm":
        await doConfirm(args);
        return "ok";
      case "reject":
        await doReject(args);
        return "ok";
      case "find":
        doFind(args);
        return "ok";
      case "digest":
        doDigest();
        return "ok";
      case "certificate":
        doCertificate();
        return "ok";
      case "verify":
        doVerify();
        return "ok";
      case "exit":
      case "quit":
        return "exit";
      default:
        rail(`  ${GRAPHITE}unknown command: ${cmd} — try ${RESET}${INK}help${RESET}`);
        blank();
        return "unknown";
    }
  } catch (err) {
    printError(err);
    return "ok";
  }
}

export function completer(line: string): [string[], string] {
  const parts = line.split(/\s+/);
  if (parts.length <= 1) {
    const hits = COMMANDS.filter((c) => c.startsWith(line));
    // A trailing space on the one unambiguous match, so completing a command name
    // leaves the cursor ready for its argument rather than needing a second Tab.
    return [hits.length === 1 ? [`${hits[0]} `] : hits, line];
  }
  const [cmd] = parts;
  const last = parts[parts.length - 1] ?? "";
  let candidates: readonly string[] = [];
  if (cmd === "open") candidates = POLICY_TEMPLATES.map((p) => p.id);
  else if ((cmd === "confirm" || cmd === "reject") && session) {
    candidates = pendingItems(store, session.id).map((r) => r.id);
  }
  return [candidates.filter((c) => c.startsWith(last)), last];
}

async function loadHistory(historyPath: string): Promise<string[]> {
  try {
    return (await readFile(historyPath, "utf8")).split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function startRepl(): Promise<void> {
  banner();
  const historyPath = path.join(os.homedir(), ".said_out_loud_history");
  const history = await loadHistory(historyPath);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    history,
    historySize: 500,
  });

  let latestHistory: readonly string[] = history;
  rl.on("history", (h) => {
    latestHistory = h;
  });
  rl.on("SIGINT", () => rl.close());

  // Prompted and read by hand rather than through the `line` event or `rl.prompt()` —
  // the same fix, for the same reason, in this app's own `review-cli.ts` (see its
  // header comment): readline emits every buffered line before an async handler
  // resolves, so a piped script ran two commands concurrently and interleaved their
  // output, and `rl.prompt()`'s implicit `resume()` throws `ERR_USE_AFTER_CLOSE` once a
  // piped input hits EOF while lines are still queued.
  const promptText = `${INK}│${RESET}  ${HEATHER}»${RESET} `;
  const interactive = Boolean(process.stdin.isTTY);
  const lines = rl[Symbol.asyncIterator]();

  async function nextLine(): Promise<string | null> {
    process.stdout.write(promptText);
    const next = await lines.next();
    if (!interactive) process.stdout.write("\n");
    return next.done ? null : next.value;
  }

  for (;;) {
    const line = await nextLine();
    if (line === null) break;
    const trimmed = line.trim();
    if (trimmed) {
      const [cmd, ...args] = trimmed.split(/\s+/);
      const result = await dispatch(cmd!.toLowerCase(), args);
      if (result === "exit") break;
    }
  }
  rl.close();

  try {
    await writeFile(historyPath, `${latestHistory.slice(0, 500).join("\n")}\n`, "utf8");
  } catch {
    // history is a convenience; losing it is not worth failing the exit over
  }
  foot("No audio was stored. No transcript exists. Nothing left this process without a yes.");
}

/** Builds the module-level session state a command handler reads. Split out from
 * `main()` so a test can boot the same REPL state `dispatch()` runs against without
 * going through argv or the readline loop. */
export function boot(): void {
  process.env.SAID_OUT_LOUD_HOME ??= path.join(process.cwd(), ".said-out-loud-repl");
  storePath = defaultStorePath()!;
  store = new SessionStore(storePath);
  bee = new MockBeeClient();
  caller = defaultCaller();
  // Resume the most recently opened session from the persisted ledger, if there is
  // one, so `queue`/`find`/`digest`/`certificate`/`verify` work in a fresh process
  // without requiring `open` again — persisting the ledger and then still needing to
  // re-announce every time would be the "off by default" complaint in a new shape.
  const resumed = [...store.sessions.values()].sort((a, b) => b.startMs - a.startMs)[0] ?? null;
  session = resumed;
  chain = resumed ? store.chainFor(resumed.id) : [];
}

async function main(): Promise<void> {
  boot();

  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    const [cmd, ...args] = argv;
    const result = await dispatch(cmd!.toLowerCase(), args);
    process.exitCode = result === "unknown" ? 1 : 0;
    return;
  }

  await startRepl();
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
