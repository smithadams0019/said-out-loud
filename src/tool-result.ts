/** The two shapes every MCP tool in this server returns, each escaped for that boundary. */

import { forOneLine, stripControls } from "./destinations.js";

export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** A whole rendered page. Newlines are the structure here, so they stay; escapes do not. */
export function text(value: string) {
  return { content: [{ type: "text" as const, text: stripControls(value) }] };
}

/**
 * A refusal names the rule and the field. It is one line by construction, so an id a
 * caller passed in cannot add a second line to it.
 */
export function failure(message: string) {
  return { content: [{ type: "text" as const, text: forOneLine(message, 500) }], isError: true };
}
