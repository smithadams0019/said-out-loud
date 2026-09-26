#!/usr/bin/env node
/**
 * Said Out Loud, the MCP server entry point.
 *
 * Exposes thirteen tools over stdio (see tools.ts), across four groups: the session
 * lifecycle, the consent record, ingestion and the ledger, and the review queue. All of
 * them call the same consent.ts/pipeline.ts/review.ts functions that src/demo.ts and the
 * test suite exercise, so there is one code path.
 *
 * Bee itself is mocked at the /v1/* boundary (see bee-client.ts) since every Bee
 * developer path dead-ends at `bee login`, which needs the iOS app.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "said-out-loud",
  version: "0.1.0",
});

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Said Out Loud MCP server failed to start:", err);
  process.exitCode = 1;
});
