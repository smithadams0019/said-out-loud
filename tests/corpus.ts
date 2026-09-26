/**
 * The shared adversarial corpus, loaded. §8 of the guard standard.
 *
 * The file is copied, not imported: the apps do not share a package, and the rows are
 * kept byte-identical across them so a defect found in one is checked in all. Nothing
 * here may be edited to make a test pass — a failing row means the field needs a
 * stronger shape, not that the row was wrong.
 */

import { readFileSync } from "node:fs";

export interface CorpusRow {
  id: string;
  text: string;
  expect: "blocked" | "clean";
  why: string;
  tags: string[];
}

export function corpus(): CorpusRow[] {
  const raw = readFileSync(new URL("./fixtures/adversarial.jsonl", import.meta.url), "utf8");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as CorpusRow);
}
