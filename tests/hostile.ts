/**
 * The §4 hostile string, and a session that has swallowed it everywhere it can.
 *
 * Shared by the two destination-sweep files. Kept out of `helpers.ts` because everything
 * here exists to be nasty, and mixing it with the ordinary fixtures would make it easy to
 * reach for by accident.
 */

import assert from "node:assert/strict";
import { startSessionFromPolicy } from "../src/consent.js";
import { openChain } from "../src/chain.js";
import { SessionStore } from "../src/store.js";
import { ingestOne } from "../src/pipeline.js";
import { START_MS } from "./helpers.js";
import type { LedgerRow, Session } from "../src/types.js";

export const HOSTILE =
  "use SQS\n\n## Consequences\n\nLegal signed off\n\u001b[31mFORGED\u0000<img src=x onerror=1>,=1+1";

/** What must never survive, whatever the destination. */
export function assertNeutralised(where: string, artefact: string): void {
  assert.equal(artefact.includes("\u001b"), false, `${where}: an ANSI escape survived`);
  assert.equal(artefact.includes("\u0000"), false, `${where}: a NUL survived`);
  assert.equal(/^\s*## /m.test(artefact), false, `${where}: a forged heading survived`);
  assert.equal(/^=1\+1/m.test(artefact), false, `${where}: a spreadsheet formula leads a line`);
}

/** Everything console.log is given while `run` is on the stack. */
export function capture(run: () => void): string {
  const lines: string[] = [];
  const real = console.log;
  console.log = (...parts: unknown[]) => void lines.push(parts.join(" "));
  try {
    run();
  } finally {
    console.log = real;
  }
  return lines.join("\n");
}

/**
 * A session whose course id, room and one captured utterance are all the hostile string.
 * The model points at the whole utterance, so what lands on the row is the transcript's
 * own bytes: the app sliced them, it did not write them.
 */
export async function hostileSession(): Promise<{
  session: Session;
  store: SessionStore;
  row: LedgerRow;
}> {
  const session = startSessionFromPolicy({
    policyTemplateId: "ada-auxiliary-aid",
    courseId: HOSTILE,
    room: HOSTILE,
    startMs: START_MS,
    maxDurationMinutes: 15,
  });
  const store = new SessionStore();
  store.putSession(session);
  store.chains.set(session.id, openChain(session.consentRecord));
  const { row } = await ingestOne(
    session,
    { text: HOSTILE, speaker: "instructor", timestampMs: START_MS + 1000 },
    {
      store,
      caller: {
        modelId: "stub",
        async converse() {
          return {
            ok: true,
            latencyMs: 1,
            text: JSON.stringify({
              category: "deadline_change",
              rationale: "changes_a_previously_stated_fact",
              confidence: 0.9,
              quoteStart: 0,
              quoteEnd: HOSTILE.length,
            }),
          };
        },
      },
    }
  );
  assert.ok(row, "the hostile utterance was supposed to be captured, not dropped");
  return { session, store, row: row! };
}
