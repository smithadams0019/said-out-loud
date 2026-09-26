/**
 * MCP tool registrations for Said Out Loud. Each tool is a thin wrapper over the same
 * consent.ts / pipeline.ts / review.ts functions that src/demo.ts and the test suite
 * call, so there is one code path and no demo-only shortcut.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "./session-tools.js";
import { registerConsentTools } from "./consent-tools.js";
import { registerIngestTools } from "./ingest-tools.js";
import { registerReviewTools } from "./review-tools.js";

export function registerTools(server: McpServer): void {
  registerSessionTools(server);
  registerConsentTools(server);
  registerIngestTools(server);
  registerReviewTools(server);
}
