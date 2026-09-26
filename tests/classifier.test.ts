/**
 * Every way the model path can fail, and the fallback that catches each one. All of these
 * run with Bedrock stubbed, so they pass with no credentials and no network.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { classifyUtterance, resetCaller } from "../src/classifier.js";
import { answering, failing, stubCaller } from "./helpers.js";

const DEADLINE = "the essay is now due Monday, not Friday.";

const keepVerdict = {
  category: "deadline_change",
  rationale: "changes_a_previously_stated_fact",
  confidence: 0.92,
  quoteStart: 0,
  quoteEnd: DEADLINE.length,
};

beforeEach(() => resetCaller());

test("the model decides, and the row says so", async () => {
  const r = await classifyUtterance(DEADLINE, { caller: answering(keepVerdict) });
  assert.equal(r.source, "bedrock");
  assert.equal(r.category, "deadline_change");
  assert.equal(r.quote, DEADLINE);
  assert.equal(r.fallbackReason, null);
});

test("a timeout falls back to the rules and records the reason", async () => {
  const r = await classifyUtterance(DEADLINE, { caller: failing("timeout") });
  assert.equal(r.source, "rules");
  assert.equal(r.fallbackReason, "bedrock_timeout");
  assert.equal(r.category, "deadline_change");
});

test("throttling falls back to the rules and is reported as throttling, not as an outage", async () => {
  const r = await classifyUtterance(DEADLINE, { caller: failing("throttled") });
  assert.equal(r.fallbackReason, "bedrock_throttled");
});

test("an unreachable Bedrock falls back to the rules", async () => {
  const r = await classifyUtterance(DEADLINE, { caller: failing("unreachable") });
  assert.equal(r.fallbackReason, "bedrock_unreachable");
  assert.equal(r.category, "deadline_change");
});

test("output that is not JSON falls back rather than throwing", async () => {
  const caller = stubCaller(() => ({ ok: true, text: "I think this is a deadline change!", latencyMs: 2 }));
  const r = await classifyUtterance(DEADLINE, { caller });
  assert.equal(r.fallbackReason, "bedrock_malformed_output");
  assert.equal(r.source, "rules");
});

test("output that tries to compose is refused by the guard, and the row names the guard", async () => {
  const caller = answering({ ...keepVerdict, note: "The essay moved to Monday." });
  const r = await classifyUtterance(DEADLINE, { caller });
  assert.equal(r.fallbackReason, "bedrock_refused_by_guard");
  assert.equal(r.source, "rules");
});

test("switching Bedrock off never calls it", async () => {
  const caller = answering(keepVerdict);
  const r = await classifyUtterance(DEADLINE, { caller: null });
  assert.equal(r.fallbackReason, "bedrock_disabled");
  assert.equal(caller.calls.length, 0);
});
