/**
 * One hostile string, the live surfaces: the terminal, a Bee todo, the instructor's
 * digest. §4 of the guard standard. The stored and exported surfaces are in
 * `destinations-page.test.ts`, driven from the same fixture.
 *
 * Said Out Loud composes nothing — the model returns offsets and the quote is sliced out
 * of the utterance — and that argument is about the model. It says nothing about the
 * utterance itself, which arrives from Bee's transcription, or about a course id a person
 * typed into `start_session`. Both are rendered, and an app that composes nothing still
 * renders source text it did not write.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmItem } from "../src/review.js";
import { MockBeeClient } from "../src/bee-client.js";
import { roomDigest } from "../src/digest.js";
import { toTodoText } from "../src/todo-text.js";
import { quoted, wrapped, plain } from "../src/render.js";
import { START_MS } from "./helpers.js";
import { HOSTILE, assertNeutralised, capture, hostileSession } from "./hostile.js";

test("the hostile string reaches the row verbatim, so the sweep is not vacuous", async () => {
  const { row } = await hostileSession();
  assert.equal(row.quote, HOSTILE.trim(), "the quote was scrubbed before any boundary");
  assert.ok(row.quote.includes("\u001b[31mFORGED"));
});

test("terminal: quoted, wrapped and plain strip what a terminal would act on", async () => {
  const { session, row } = await hostileSession();
  const out = capture(() => {
    quoted(row.quote);
    wrapped(toTodoText(row));
    console.log(plain(session.courseId));
  });
  assertNeutralised("terminal", out);
  assert.ok(out.includes("FORGED"), "the words themselves should still be readable");
});

test("bee todo: one bounded line, because it leaves the process", async () => {
  const { store, row } = await hostileSession();
  const { todo } = await confirmItem(store, new MockBeeClient(), row.id, START_MS + 2000);
  assertNeutralised("bee todo", todo.text);
  assert.equal(todo.text.includes("\n"), false, "a todo is one line");
});

test("room digest: the instructor's view carries no escape and no extra line", async () => {
  const { session, store, row } = await hostileSession();
  await confirmItem(store, new MockBeeClient(), row.id, START_MS + 2000);
  const digest = roomDigest(store, session.courseId, session.room, START_MS - 1, START_MS + 86_400_000);
  assert.equal(digest.items.length, 1);
  assertNeutralised("digest json", JSON.stringify(digest));
  assertNeutralised("digest rendered", capture(() => quoted(digest.items[0].quote)));
});
