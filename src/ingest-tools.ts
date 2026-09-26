/**
 * MCP tools for feeding utterances through the consent pipeline and reading the ledger
 * back: ingest_utterance, get_ledger, search_course.
 *
 * See session-tools.ts for lifecycle and review-tools.ts for the queue.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ingestOne } from "./pipeline.js";
import { reviewStats } from "./review.js";
import { store, sessionNotFound } from "./store.js";
import { json } from "./tool-result.js";
import { CATEGORIES } from "./vocab.js";

export function registerIngestTools(server: McpServer): void {
  server.registerTool(
    "ingest_utterance",
    {
      title: "Ingest one utterance from the Bee stream",
      description:
        "Runs one utterance through the pipeline in order: room-scope check, expected-" +
        "speaker check, then classification. Anything classified as an announcement lands " +
        "in the review queue as pending; it does not become a todo until the student " +
        "confirms it. Everything else is dropped with a reason and no content.",
      inputSchema: {
        sessionId: z.string(),
        text: z.string(),
        speaker: z.string(),
        timestampMs: z.number(),
      },
    },
    async ({ sessionId, text, speaker, timestampMs }) => {
      const session = store.sessions.get(sessionId);
      if (!session) return sessionNotFound(sessionId);
      const { row, drop } = await ingestOne(session, { text, speaker, timestampMs }, { store });
      return json({ row, drop });
    }
  );

  server.registerTool(
    "get_ledger",
    {
      title: "Get the ledger for a session",
      description:
        "Returns the captured items for a session with their review state, which classifier " +
        "decided each one, and the counts.",
      inputSchema: {
        sessionId: z.string(),
        reviewState: z.enum(["pending", "confirmed", "rejected"]).optional(),
      },
    },
    async ({ sessionId, reviewState }) => {
      if (!store.sessions.has(sessionId)) return sessionNotFound(sessionId);
      const all = store.ledgerFor(sessionId);
      const rows = reviewState ? all.filter((r) => r.review === reviewState) : all;
      return json({ rows, stats: reviewStats(all) });
    }
  );

  server.registerTool(
    "search_course",
    {
      title: "Search everything captured in one course",
      description:
        "Per-course history. Searches confirmed announcements across every session of a " +
        "course, optionally by category or by a word in the quote, so a student can answer " +
        "'when did the deadline actually move' weeks later.",
      inputSchema: {
        courseId: z.string(),
        category: z.enum(CATEGORIES as unknown as [string, ...string[]]).optional(),
        contains: z.string().optional(),
        includeUnreviewed: z.boolean().optional(),
      },
    },
    async ({ courseId, category, contains, includeUnreviewed }) => {
      const needle = contains?.toLowerCase();
      const rows = store
        .rowsForCourse(courseId)
        .filter((r) => (includeUnreviewed ? r.review !== "rejected" : r.review === "confirmed"))
        .filter((r) => (category ? r.category === category : true))
        .filter((r) => (needle ? r.quote.toLowerCase().includes(needle) : true))
        .sort((a, b) => b.timestampMs - a.timestampMs);
      return json({ courseId, matches: rows.length, rows });
    }
  );
}
