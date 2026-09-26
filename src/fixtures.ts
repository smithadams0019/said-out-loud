/** Loads the mocked session transcript fixture and applies offsets to a real start time. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Utterance } from "./types.js";
import type { Category } from "./vocab.js";
import { isCategory } from "./vocab.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RawFixtureUtterance {
  offsetMs: number;
  speaker: string;
  text: string;
  /** Hand-written ground truth, used only to score the classifiers. The pipeline never reads it. */
  label?: string;
  note?: string;
}

interface RawFixture {
  courseId: string;
  room: string;
  utterances: RawFixtureUtterance[];
}

/** An utterance plus the hand label, for the classifier comparison in the demo. */
export interface LabelledUtterance extends Utterance {
  label: Category | null;
  /** True when the fixture carries no label, because a consent rule drops it before classification. */
  unlabelled: boolean;
  note?: string;
}

export interface LoadedFixture {
  courseId: string;
  room: string;
  utterances: Utterance[];
  labelled: LabelledUtterance[];
}

export function loadSessionTranscript(startMs: number): LoadedFixture {
  const path = join(__dirname, "fixtures", "session-transcript.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as RawFixture;

  const labelled: LabelledUtterance[] = raw.utterances.map((u) => ({
    text: u.text,
    speaker: u.speaker,
    timestampMs: startMs + u.offsetMs,
    label: isCategory(u.label) ? u.label : null,
    unlabelled: u.label === undefined,
    note: u.note,
  }));

  return {
    courseId: raw.courseId,
    room: raw.room,
    utterances: labelled.map(({ text, speaker, timestampMs }) => ({ text, speaker, timestampMs })),
    labelled,
  };
}
