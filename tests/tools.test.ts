/**
 * The MCP session surface: which tools exist, and the consent record a session writes
 * before anything else. Registered against a real McpServer and called end to end over an
 * in-memory transport, so the tools carry the same guarantees as the demo rather than
 * being a thin layer nobody tested. The queue is in tools-review.test.ts.
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

test("every tool the README lists is actually registered", async () => {
  const client = await connected();
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "confirm_item",
    "end_session",
    "export_consent_record",
    "get_consent_record",
    "get_ledger",
    "get_room_digest",
    "ingest_utterance",
    "list_policies",
    "list_review_queue",
    "reject_item",
    "search_course",
    "start_session",
    "verify_consent_record",
  ]);
});

test("a session started over MCP writes its consent record first, and it verifies", async () => {
  const client = await connected();
  const started = JSON.parse(
    body(
      await client.callTool({
        name: "start_session",
        arguments: {
          policyTemplateId: "department-recording",
          courseId: "MCP-101",
          room: "Test Hall",
          startMs: START_MS,
          maxDurationMinutes: 15,
        },
      })
    )
  );
  const sessionId = started.session.id;
  assert.ok(started.consentChainHead);

  const consent = JSON.parse(body(await client.callTool({ name: "get_consent_record", arguments: { sessionId } })));
  assert.equal(consent.chain[0].kind, "consent_announcement");
  assert.equal(consent.policyTemplateId, "department-recording");

  const verdict = JSON.parse(body(await client.callTool({ name: "verify_consent_record", arguments: { sessionId } })));
  assert.equal(verdict.valid, true);
});
