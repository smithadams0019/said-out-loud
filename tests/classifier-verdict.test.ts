/**
 * What the classifier decides once the model does answer: the judgements a regex cannot
 * make, the memo that stops the same utterance being billed twice, and the student's
 * corrections reaching the prompt. Bedrock is stubbed throughout.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { classifyUtterance, resetCaller } from "../src/classifier.js";
import { answering, stubCaller } from "./helpers.js";


const DEADLINE = "the essay is now due Monday, not Friday.";
const CONTENT = "The rate constant depends on temperature, which the Arrhenius equation describes.";

const keepVerdict = {
  category: "deadline_change",
  rationale: "changes_a_previously_stated_fact",
  confidence: 0.92,
  quoteStart: 0,
  quoteEnd: DEADLINE.length,
};

beforeEach(() => resetCaller());

test("the model can drop something the rules would have kept", async () => {
  const caller = answering({
    category: "none",
    rationale: "describes_course_content",
    confidence: 0.9,
    quoteStart: 0,
    quoteEnd: 0,
  });
  const r = await classifyUtterance("To answer this question you integrate the rate law.", { caller });
  assert.equal(r.category, null);
  assert.equal(r.quote, "");
});

test("the model can keep something the rules cannot see at all", async () => {
  const text = "Forget what the syllabus says about the midterm, it is open book now.";
  const caller = answering({
    category: "exam_signal",
    rationale: "changes_a_previously_stated_fact",
    confidence: 0.85,
    quoteStart: 0,
    quoteEnd: text.length,
  });
  const r = await classifyUtterance(text, { caller });
  assert.equal(r.category, "exam_signal");
  assert.equal(r.source, "bedrock");
});

test("a code fence around the JSON is tolerated", async () => {
  const caller = stubCaller(() => ({
    ok: true,
    text: "```json\n" + JSON.stringify(keepVerdict) + "\n```",
    latencyMs: 3,
  }));
  const r = await classifyUtterance(DEADLINE, { caller });
  assert.equal(r.source, "bedrock");
});

test("ordinary lecture content is dropped by both paths", async () => {
  const model = await classifyUtterance(CONTENT, {
    caller: answering({ category: "none", rationale: "describes_course_content", confidence: 0.95, quoteStart: 0, quoteEnd: 0 }),
  });
  const rules = await classifyUtterance(CONTENT, { caller: null });
  assert.equal(model.category, null);
  assert.equal(rules.category, null);
});

test("the same utterance is not sent to Bedrock twice", async () => {
  const caller = answering(keepVerdict);
  await classifyUtterance(DEADLINE, { caller });
  await classifyUtterance(DEADLINE, { caller });
  assert.equal(caller.calls.length, 1);
});

test("a fallback is not memoised, so the next utterance gets another chance at the model", async () => {
  let fail = true;
  const caller = stubCaller(() =>
    fail
      ? { ok: false as const, failure: "throttled" as const, latencyMs: 1 }
      : { ok: true as const, text: JSON.stringify(keepVerdict), latencyMs: 2 }
  );
  assert.equal((await classifyUtterance(DEADLINE, { caller })).source, "rules");
  fail = false;
  assert.equal((await classifyUtterance(DEADLINE, { caller })).source, "bedrock");
});

test("the student's rejections are shown to the model for later utterances in that course", async () => {
  const caller = answering(keepVerdict);
  await classifyUtterance(DEADLINE, {
    caller,
    corrections: [
      { courseId: "CHEM-201", quote: "That assignment has not moved.", wrongCategory: "deadline_change", correctedAtMs: 1 },
    ],
  });
  assert.match(caller.calls[0], /already rejected/);
  assert.match(caller.calls[0], /That assignment has not moved\./);
});

test("a row says which model decided it, and says nothing when the rules did", async () => {
  const byModel = await classifyUtterance(DEADLINE, { caller: answering(keepVerdict) });
  assert.equal(byModel.modelId, "stub");

  const byRules = await classifyUtterance(DEADLINE, { caller: null });
  assert.equal(byRules.modelId, null);
  assert.equal(byRules.source, "rules");
});
