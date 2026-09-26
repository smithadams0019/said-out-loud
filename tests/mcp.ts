/**
 * Driving the MCP surface for real: a connected client over the in-memory transport, and
 * a course built entirely through tool calls.
 *
 * Tests that assert on a tool's output belong against the wired server rather than the
 * function it wraps, because the wiring is what a caller gets. Bedrock is switched off
 * here rather than stubbed: these tools use the process-wide caller, and `defaultCaller()`
 * reads the environment on every call rather than at import.
 */

import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../src/tools.js";
import { START_MS } from "./helpers.js";

process.env.SAID_OUT_LOUD_BEDROCK = "off";

/** Two sentences the keyword rules keep, so this fixture needs no model at all. */
export const KEPT = "The essay deadline moved to Monday, so the due date is now the 14th.";
export const ALSO_KEPT = "We are moving to room 214 for the rest of term.";

export async function connected(): Promise<Client> {
  const server = new McpServer({ name: "said-out-loud-test", version: "0.0.0" });
  registerTools(server);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

export function body(result: unknown): string {
  return (result as { content: { text: string }[] }).content[0].text;
}

/** A course with one confirmed row and one rejected row, built entirely over MCP. */
export async function courseWithBothOutcomes(courseId: string) {
  const client = await connected();
  const started = JSON.parse(
    body(
      await client.callTool({
        name: "start_session",
        arguments: {
          policyTemplateId: "department-recording",
          courseId,
          room: "Hall A",
          startMs: START_MS,
          maxDurationMinutes: 30,
        },
      })
    )
  );
  const sessionId: string = started.session.id;

  const ingest = async (text: string) =>
    JSON.parse(
      body(
        await client.callTool({
          name: "ingest_utterance",
          arguments: { sessionId, text, speaker: "instructor", timestampMs: START_MS + 1000 },
        })
      )
    ).row;

  const confirmed = await ingest(KEPT);
  const rejected = await ingest(ALSO_KEPT);
  assert.ok(confirmed && rejected, "the keyword rules were supposed to keep both of these");

  await client.callTool({ name: "confirm_item", arguments: { rowId: confirmed.id, atMs: START_MS + 60_000 } });
  await client.callTool({ name: "reject_item", arguments: { rowId: rejected.id, atMs: START_MS + 61_000 } });
  return { client, sessionId, confirmed, rejected };
}
