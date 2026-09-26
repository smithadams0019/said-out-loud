import { test } from "node:test";
import assert from "node:assert/strict";
import { MockBeeClient, toBeeEvent, fromBeeEvent } from "../src/bee-client.js";

test("toBeeEvent / fromBeeEvent round-trip matches Bee's documented new-utterance shape", () => {
  const utterance = { text: "hello", speaker: "instructor", timestampMs: 1234 };
  const event = toBeeEvent(utterance, "conv_1");

  assert.deepEqual(event.utterance, { text: "hello", speaker: "instructor" });
  assert.equal(event.conversation_uuid, "conv_1");
  assert.equal(event.created_at_ms, 1234);

  const back = fromBeeEvent(event);
  assert.deepEqual(back, utterance);
});

test("createTodo/listTodos mirror the documented POST/GET /v1/todos shape", async () => {
  const client = new MockBeeClient();
  const created = await client.createTodo({ text: "email me by Friday", conversation_uuid: "conv_1" });
  assert.equal(created.text, "email me by Friday");
  assert.equal(created.completed, false);
  assert.ok(created.id.startsWith("todo_"));

  const all = await client.listTodos();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, created.id);
});

test("stream() yields events in order, standing in for the SSE new-utterance feed", async () => {
  const client = new MockBeeClient();
  const events = [
    { utterance: { text: "a", speaker: "instructor" }, conversation_uuid: "c", created_at_ms: 1 },
    { utterance: { text: "b", speaker: "instructor" }, conversation_uuid: "c", created_at_ms: 2 },
  ];
  const received: string[] = [];
  for await (const e of client.stream(events)) {
    received.push(e.utterance.text);
  }
  assert.deepEqual(received, ["a", "b"]);
});
