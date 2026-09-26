/**
 * MCP tools for session lifecycle and the policy templates it runs inside:
 * list_policies, start_session, end_session.
 *
 * See consent-tools.ts for reading and proving the consent record these create,
 * review-tools.ts for the queue, and ingest-tools.ts for feeding the pipeline.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startSessionFromPolicy, endSession } from "./consent.js";
import { openChain, appendEntry } from "./chain.js";
import { POLICY_TEMPLATES } from "./policies.js";
import { store, sessionNotFound } from "./store.js";
import { json } from "./tool-result.js";

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    "list_policies",
    {
      title: "List the institutional policy templates a session can open under",
      description:
        "Said Out Loud never invents a consent regime; it runs inside one an institution " +
        "already grants. Each template supplies the announcement wording, the speakers it " +
        "listens for, how long anything is kept, and what it does not cover.",
      inputSchema: {},
    },
    async () =>
      json(
        POLICY_TEMPLATES.map((p) => ({
          id: p.id,
          label: p.label,
          basis: p.basis,
          expectedSpeakers: p.expectedSpeakers,
          retentionDays: p.retentionDays,
          doesNotCover: p.doesNotCover,
        }))
      )
  );

  server.registerTool(
    "start_session",
    {
      title: "Start a room-scoped teaching session inside a policy",
      description:
        "Opens a session under one of the policy templates, announces the capture to the " +
        "room, and writes that announcement as entry 0 of a tamper-evident chain. Refuses " +
        "to start without a known policy, expected speakers, a duration cap and a retention " +
        "period.",
      inputSchema: {
        policyTemplateId: z.string().min(1),
        courseId: z.string().min(1),
        room: z.string().min(1),
        startMs: z.number(),
        maxDurationMinutes: z.number().positive(),
        expectedSpeakers: z.array(z.string()).min(1).optional(),
      },
    },
    async (args) => {
      const session = startSessionFromPolicy(args);
      store.putSession(session);
      const chain = openChain(session.consentRecord);
      store.chains.set(session.id, chain);
      store.putChainEntry(chain[0]);
      return json({ session, consentChainHead: chain[0].hash });
    }
  );

  server.registerTool(
    "end_session",
    {
      title: "End a session",
      description: "Closes a session at the given timestamp, no later than its duration cap.",
      inputSchema: { sessionId: z.string(), endedAtMs: z.number() },
    },
    async ({ sessionId, endedAtMs }) => {
      const session = store.sessions.get(sessionId);
      if (!session) return sessionNotFound(sessionId);
      const closed = endSession(session, endedAtMs);
      store.putSession(closed);
      const rows = store.ledgerFor(sessionId).filter((r) => r.review === "confirmed").length;
      store.putChainEntry(
        appendEntry(store.chainFor(sessionId), "session_closed", sessionId, closed.endMs!, { rows })
      );
      return json(closed);
    }
  );
}
