/**
 * MCP tools for the consent record itself: get_consent_record, export_consent_record,
 * verify_consent_record.
 *
 * The consent record is the most defensible thing in the product, so it gets its own
 * surface: one tool to read it, one to hand it to somebody, one to check it still adds up.
 * See session-tools.ts for the lifecycle that creates it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { verifyChain } from "./chain.js";
import { renderConsentCertificate } from "./export.js";
import { store, sessionNotFound } from "./store.js";
import { json, text } from "./tool-result.js";

export function registerConsentTools(server: McpServer): void {
  server.registerTool(
    "get_consent_record",
    {
      title: "Get the consent record for a session",
      description:
        "Returns the session's first record: the exact announcement, when it was made, the " +
        "policy it runs under, who it expected to hear, and when it must be deleted.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      const session = store.sessions.get(sessionId);
      if (!session) return sessionNotFound(sessionId);
      return json({ ...session.consentRecord, chain: store.chainFor(sessionId) });
    }
  );

  server.registerTool(
    "export_consent_record",
    {
      title: "Export the consent record as a page a student can hand over",
      description:
        "Renders the announcement, the policy, what was kept and the full hash chain as one " +
        "plain-text page for a disability services office, a grade appeal, or an instructor " +
        "who asks what is being captured. Prints what it proves and what it does not.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      const session = store.sessions.get(sessionId);
      if (!session) return sessionNotFound(sessionId);
      return text(
        renderConsentCertificate({
          consent: session.consentRecord,
          chain: store.chainFor(sessionId),
          rows: store.ledgerFor(sessionId),
          courseId: session.courseId,
          room: session.room,
        })
      );
    }
  );

  server.registerTool(
    "verify_consent_record",
    {
      title: "Verify a session's consent chain",
      description:
        "Re-hashes the chain and reports whether the announcement still precedes everything " +
        "captured under it, or the exact entry where it stops adding up.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      if (!store.sessions.has(sessionId)) return sessionNotFound(sessionId);
      return json(verifyChain(store.chainFor(sessionId)));
    }
  );
}
