import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/extractor.js";

test("classifies a deadline change", () => {
  const r = classify("the problem set essay is now due Monday, not Friday");
  assert.equal(r.matched, true);
  assert.equal((r as { category: string }).category, "deadline_change");
});

test("classifies a room change", () => {
  const r = classify("we're moving to room 214 for the rest of the week");
  assert.equal(r.matched, true);
  assert.equal((r as { category: string }).category, "room_change");
});

test("classifies an exam signal", () => {
  const r = classify("this will be on the exam so make sure you understand it");
  assert.equal(r.matched, true);
  assert.equal((r as { category: string }).category, "exam_signal");
});

test("classifies a contact instruction", () => {
  const r = classify("email me by Friday and I'll get to it over the weekend");
  assert.equal(r.matched, true);
  assert.equal((r as { category: string }).category, "contact_instruction");
});

test("classifies a relayed answer", () => {
  const r = classify("good question, so the answer to that one is it's the Thursday after");
  assert.equal(r.matched, true);
  assert.equal((r as { category: string }).category, "relayed_answer");
});

test("design principle: does NOT classify ordinary lecture content", () => {
  const r = classify(
    "The rate constant depends on temperature according to the Arrhenius equation."
  );
  assert.equal(r.matched, false);
});

test("design principle: does NOT classify a side conversation", () => {
  const r = classify("did you get the notes from last class, mine are a mess");
  assert.equal(r.matched, false);
});

test("the rules carry a rationale code, so a rules row is as auditable as a model row", () => {
  const r = classify("we're moving to room 214 for the rest of the week");
  assert.equal(r.matched, true);
  assert.equal((r as { rationale: string }).rationale, "relocates_the_class");
});

test("the known false positives are documented in the fixture and still present here", () => {
  // These are the four sentences the model gets right and the patterns get wrong. They are
  // kept as a test so that tightening a regex does not quietly change the comparison the
  // demo prints.
  for (const text of [
    "That assignment I mentioned has not moved, it is still where the syllabus says.",
    "To answer this question properly you need to integrate the rate law first.",
    "We are moving to room temperature for the next part of the demonstration, so the rate constant drops.",
    "Students email me by the dozen about this, and the answer is always in chapter four.",
  ]) {
    assert.equal(classify(text).matched, true, `the rules no longer mis-fire on: ${text}`);
  }
});

test("the known false negatives are still invisible to the rules", () => {
  for (const text of [
    "Something I should have said at the start: I am not holding office hours on Thursday, come Wednesday instead.",
    "Forget what the syllabus says about the second midterm being closed book, it is open book now.",
    "The lab report template on the site is the old one, I will replace it tonight, so do not start from it yet.",
  ]) {
    assert.equal(classify(text).matched, false, `the rules now catch: ${text}`);
  }
});
