/**
 * The MCP review surface: ingest, queue, confirm, and the refusal to review twice. Run
 * against a real McpServer over an in-memory transport, with Bedrock switched off.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools.js";
import { START_MS } from "./helpers.js";


// The MCP tools use the process-wide store and the shared Bedrock caller. Switch the
// model off here so this file never reaches the network, whatever the machine has
// configured: `defaultCaller()` reads this on every call, not at import.
process.env.SAID_OUT_LOUD_BEDROCK = "off";

async function connected() {
  const server = new McpServer({ name: "said-out-loud-test", version: "0.0.0" });
  registerTools(server);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function body(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0].text;
}

test("ingesting then confirming over MCP is the only path to a todo", async () => {
  const client = await connected();
  const started = JSON.parse(
    body(
      await client.callTool({
        name: "start_session",
        arguments: {
          policyTemplateId: "ada-auxiliary-aid",
          courseId: "MCP-202",
          room: "Test Hall",
          startMs: START_MS,
          maxDurationMinutes: 15,
        },
      })
    )
  );
  const sessionId = started.session.id;

  const ingested = JSON.parse(
    body(
      await client.callTool({
        name: "ingest_utterance",
        arguments: {
          sessionId,
          text: "we're moving to room 214 for the rest of the week",
          speaker: "instructor",
          timestampMs: START_MS + 1000,
        },
      })
    )
  );
  assert.equal(ingested.row.review, "pending");

  const queue = JSON.parse(body(await client.callTool({ name: "list_review_queue", arguments: { sessionId } })));
  assert.equal(queue.pending.length, 1);

  const confirmed = JSON.parse(
    body(await client.callTool({ name: "confirm_item", arguments: { rowId: ingested.row.id, atMs: START_MS + 60_000 } }))
  );
  assert.equal(confirmed.row.review, "confirmed");
  assert.ok(confirmed.todo.id);

  const again = await client.callTool({
    name: "confirm_item",
    arguments: { rowId: ingested.row.id, atMs: START_MS + 61_000 },
  });
  assert.equal((again as { isError?: boolean }).isError, true, "a second review should be refused, not crash the server");
});

test("list_policies names what each template does not cover", async () => {
  const client = await connected();
  const policies = JSON.parse(body(await client.callTool({ name: "list_policies", arguments: {} })));
  assert.ok(policies.length >= 4);
  assert.ok(policies.every((p: { doesNotCover: string }) => p.doesNotCover.length > 10));
});

test("an unknown session is reported, not thrown", async () => {
  const client = await connected();
  const result = await client.callTool({ name: "get_ledger", arguments: { sessionId: "session_nope" } });
  assert.equal((result as { isError?: boolean }).isError, true);
});
