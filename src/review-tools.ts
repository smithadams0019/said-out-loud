/**
 * MCP tools for the student's review queue and the instructor's digest:
 * list_review_queue, confirm_item, reject_item, get_room_digest.
 *
 * Nothing becomes a Bee todo without passing through confirm_item, which is the point:
 * the student reads each captured sentence and decides. See review.ts for why that is
 * the design principle and not only a quality check.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { confirmItem, rejectItem, pendingItems, reviewStats, ReviewError } from "./review.js";
import { roomDigest } from "./digest.js";
import { MockBeeClient } from "./bee-client.js";
import { store } from "./store.js";
import { json, failure } from "./tool-result.js";

const bee = new MockBeeClient();

export function registerReviewTools(server: McpServer): void {
  server.registerTool(
    "list_review_queue",
    {
      title: "List captured items waiting on the student",
      description:
        "Everything the classifier captured and nobody has judged yet, oldest first, with " +
        "the verbatim quote, which classifier decided it and how sure it was.",
      inputSchema: { sessionId: z.string().optional() },
    },
    async ({ sessionId }) => {
      const pending = pendingItems(store, sessionId);
      const scope = sessionId ? store.ledgerFor(sessionId) : [...store.ledgers.values()].flat();
      return json({ pending, stats: reviewStats(scope) });
    }
  );

  server.registerTool(
    "confirm_item",
    {
      title: "Confirm a captured item, which creates its Bee todo",
      description:
        "The student agrees this was announced. The item is marked confirmed, appended to " +
        "the session's chain, and a Bee todo is created. This is the only path by which a " +
        "todo can exist.",
      inputSchema: { rowId: z.string(), atMs: z.number() },
    },
    async ({ rowId, atMs }) => {
      try {
        return json(await confirmItem(store, bee, rowId, atMs));
      } catch (err) {
        if (err instanceof ReviewError) return failure(err.message);
        throw err;
      }
    }
  );

  server.registerTool(
    "reject_item",
    {
      title: "Reject a captured item, which teaches the classifier this course",
      description:
        "The student says this was not an announcement. No todo is created. The row stays, " +
        "marked rejected, because a chain with a hole in it proves nothing, and the quote " +
        "is kept as a correction the classifier is shown on later utterances in this course.",
      inputSchema: { rowId: z.string(), atMs: z.number() },
    },
    async ({ rowId, atMs }) => {
      try {
        return json(rejectItem(store, rowId, atMs));
      } catch (err) {
        if (err instanceof ReviewError) return failure(err.message);
        throw err;
      }
    }
  );

  server.registerTool(
    "get_room_digest",
    {
      title: "What was announced in a room, without who recorded it",
      description:
        "The instructor's view: every confirmed announcement captured in a course and room " +
        "over a window, which is a list of sentences the instructor said out loud to the " +
        "whole room. It carries no student name, no roster and no device: the return type " +
        "has no field for any of them.",
      inputSchema: {
        courseId: z.string(),
        room: z.string(),
        windowStartMs: z.number(),
        windowEndMs: z.number(),
      },
    },
    async ({ courseId, room, windowStartMs, windowEndMs }) =>
      json(roomDigest(store, courseId, room, windowStartMs, windowEndMs))
  );
}
