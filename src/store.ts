/**
 * The store: sessions, ledger rows, consent chains and the student's own corrections.
 *
 * Text only, by construction. There is no field anywhere below that can hold audio, and
 * dropped utterances never arrive here at all: `DropRecord` has no text field, so the
 * content of a discarded side conversation cannot be persisted even by mistake.
 *
 * Persistence is an append-only JSONL file under `SAID_OUT_LOUD_HOME` (default
 * `.said-out-loud/`), which suits a hash chain: rows are written once and never edited in
 * place. It is off unless a path is configured, so tests and the demo stay in memory.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ChainEntry, Correction, LedgerRow, Session } from "./types.js";
import { failure } from "./tool-result.js";

export interface StoreRecord {
  session?: Session;
  row?: LedgerRow;
  chainEntry?: ChainEntry;
  correction?: Correction;
}

export class SessionStore {
  readonly sessions = new Map<string, Session>();
  readonly ledgers = new Map<string, LedgerRow[]>();
  readonly chains = new Map<string, ChainEntry[]>();
  readonly corrections: Correction[] = [];
  private readonly path: string | null;

  constructor(path: string | null = null) {
    this.path = path;
    if (path && existsSync(path)) this.load();
  }

  private write(record: StoreRecord): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(record) + "\n", "utf8");
  }

  private load(): void {
    for (const line of readFileSync(this.path!, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as StoreRecord;
      if (rec.session) this.sessions.set(rec.session.id, rec.session);
      if (rec.chainEntry) this.chainFor(rec.chainEntry.sessionId).push(rec.chainEntry);
      if (rec.correction) this.corrections.push(rec.correction);
      if (rec.row) {
        const rows = this.ledgerFor(rec.row.sessionId);
        const at = rows.findIndex((r) => r.id === rec.row!.id);
        if (at === -1) rows.push(rec.row);
        else rows[at] = rec.row;
      }
    }
  }

  ledgerFor(sessionId: string): LedgerRow[] {
    let rows = this.ledgers.get(sessionId);
    if (!rows) this.ledgers.set(sessionId, (rows = []));
    return rows;
  }

  chainFor(sessionId: string): ChainEntry[] {
    let chain = this.chains.get(sessionId);
    if (!chain) this.chains.set(sessionId, (chain = []));
    return chain;
  }

  putSession(session: Session): void {
    this.sessions.set(session.id, session);
    this.write({ session });
  }

  putChainEntry(entry: ChainEntry): void {
    this.write({ chainEntry: entry });
  }

  putRow(row: LedgerRow): void {
    const rows = this.ledgerFor(row.sessionId);
    const at = rows.findIndex((r) => r.id === row.id);
    if (at === -1) rows.push(row);
    else rows[at] = row;
    this.write({ row });
  }

  findRow(rowId: string): LedgerRow | undefined {
    for (const rows of this.ledgers.values()) {
      const hit = rows.find((r) => r.id === rowId);
      if (hit) return hit;
    }
    return undefined;
  }

  addCorrection(correction: Correction): void {
    this.corrections.push(correction);
    this.write({ correction });
  }

  correctionsFor(courseId: string): Correction[] {
    return this.corrections.filter((c) => c.courseId === courseId);
  }

  sessionsForCourse(courseId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.courseId === courseId);
  }

  rowsForCourse(courseId: string): LedgerRow[] {
    return [...this.ledgers.values()].flat().filter((r) => r.courseId === courseId);
  }
}

/** Where a persisted store lives when one is configured. */
export function defaultStorePath(): string | null {
  const home = process.env.SAID_OUT_LOUD_HOME;
  return home ? join(home, "ledger.jsonl") : null;
}

/** The process-wide store the MCP server uses. The demo and tests build their own. */
export const store = new SessionStore(defaultStorePath());

/** Shared MCP tool-result shape for "no session with this id". */
export function sessionNotFound(sessionId: string) {
  return failure(`No such session: ${sessionId}`);
}
