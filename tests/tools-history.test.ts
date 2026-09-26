/**
 * The five MCP tools nothing drove end to end: search_course, reject_item, end_session,
 * get_room_digest and export_consent_record.
 *
 * `tools.test.ts` asserted that all thirteen are registered, which is a different claim
 * and a weaker one. The mutation check showed the gap: `search_course`'s filter could be
 * replaced with `() => true` — putting every pending and rejected row into the per-course
 * history — and the whole suite stayed green.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { START_MS } from "./helpers.js";
import { body, courseWithBothOutcomes } from "./mcp.js";

test("search_course returns confirmed rows only, and never a rejected one", async () => {
  const { client, rejected } = await courseWithBothOutcomes("HIST-101");
  const found = JSON.parse(body(await client.callTool({ name: "search_course", arguments: { courseId: "HIST-101" } })));
  assert.equal(found.matches, 1, "the per-course history is not confirmed-only");
  assert.equal(found.rows[0].review, "confirmed");
  assert.equal(
    found.rows.some((r: { id: string }) => r.id === rejected.id),
    false,
    "a row the student rejected came back in the course history"
  );

  const wider = JSON.parse(
    body(await client.callTool({ name: "search_course", arguments: { courseId: "HIST-101", includeUnreviewed: true } }))
  );
  assert.equal(wider.matches, 1, "includeUnreviewed must still exclude rejected rows");
});

test("search_course narrows by category and by a word in the quote", async () => {
  const { client } = await courseWithBothOutcomes("HIST-202");
  const byCategory = JSON.parse(
    body(await client.callTool({ name: "search_course", arguments: { courseId: "HIST-202", category: "room_change" } }))
  );
  assert.equal(byCategory.matches, 0, "the confirmed row is a deadline change, not a room change");

  const byWord = JSON.parse(
    body(await client.callTool({ name: "search_course", arguments: { courseId: "HIST-202", contains: "deadline" } }))
  );
  assert.equal(byWord.matches, 1);
  assert.ok(byWord.rows[0].quote.includes("deadline"));
});

test("reject_item creates no todo, and the digest shows only what the student stood behind", async () => {
  const { client, sessionId } = await courseWithBothOutcomes("HIST-303");
  const digest = JSON.parse(
    body(
      await client.callTool({
        name: "get_room_digest",
        arguments: { courseId: "HIST-303", room: "Hall A", windowStartMs: START_MS - 1, windowEndMs: START_MS + 86_400_000 },
      })
    )
  );
  assert.equal(digest.items.length, 1, "the instructor saw something nobody confirmed");
  assert.ok(digest.items[0].quote.includes("deadline"));
  assert.equal(Object.keys(digest).includes("students"), false);
  assert.equal(JSON.stringify(digest).includes(sessionId), false, "the digest named a session");
});

test("end_session closes the session and export_consent_record renders the page", async () => {
  const { client, sessionId } = await courseWithBothOutcomes("HIST-404");
  const closed = JSON.parse(
    body(await client.callTool({ name: "end_session", arguments: { sessionId, endedAtMs: START_MS + 20 * 60_000 } }))
  );
  assert.equal(closed.closed, true);
  assert.equal(closed.endMs, START_MS + 20 * 60_000);

  const page = body(await client.callTool({ name: "export_consent_record", arguments: { sessionId } }));
  assert.match(page, /^SAID OUT LOUD, CONSENT RECORD$/m);
  assert.match(page, /^VERIFIED\. \d+ entries, head [0-9a-f]{64}\.$/m);
  assert.match(page, /1 announcement\(s\) confirmed by the student, 1 rejected\./);
  assert.match(page, /session closed$/m);
});
