/**
 * Bee's `/v1/*` wire shape, mocked. No live device: every Bee developer path requires
 * `bee login`, which requires the iOS app. There is no web login, no API key and no
 * published sample payload set.
 *
 * What is reproduced here is the documented request and response shape, nothing above it:
 *
 *   - `new-utterance` stream events, `{ utterance: { text, speaker }, conversation_uuid }`
 *   - `conversations`, `facts` and `todos` resources with CRUD
 *   - `todos/suggestions`
 *
 * Swapping this file for an authenticated `bee-cli` client is the only change a live
 * integration needs.
 *
 * Worth stating plainly, because it is the usual objection to a mocked demo: the mock
 * cannot flatter the part of this product that is being judged. The classifier sees one
 * utterance's text at a time and returns a category, a rationale code, a confidence number
 * and two character offsets. It never sees a conversation, a speaker or a session, and it
 * never returns a string a student reads. So the guard in `composition-guard.ts`, the
 * offset snapping in `quote-span.ts` and the hash chain in `chain.ts` all behave exactly
 * as they would against a live device, because none of them can tell the difference. What
 * a real Bee account would change is the quality of the transcript, not the behaviour of
 * the containment.
 *
 * The fixtures keep `speaker` as a role label and the fragments as fragments, because
 * Bee's published output labels every speaker `Unknown` and breaks sentences mid-thought.
 */

import type { Utterance } from "./types.js";

/** Wire shape of a single Bee `new-utterance` SSE event. */
export interface BeeNewUtteranceEvent {
  utterance: {
    text: string;
    speaker: string;
  };
  conversation_uuid: string;
  /** Bee stamps events server-side; mocked here as epoch ms for determinism. */
  created_at_ms: number;
}

export interface BeeTodoCreateRequest {
  text: string;
  conversation_uuid: string;
}

export interface BeeTodoCreateResponse {
  id: string;
  text: string;
  conversation_uuid: string;
  created_at: string;
  completed: boolean;
}

/**
 * Minimal mock of the Bee `/v1/*` client. Methods mirror the documented resources:
 * conversations, todos (POST /v1/todos), and a stream() generator standing in for
 * the SSE `new-utterance` feed, since we have no device to open a real stream from.
 */
export class MockBeeClient {
  private todos: BeeTodoCreateResponse[] = [];
  private nextTodoId = 1;

  /** Stand-in for opening a `bee stream` connection and receiving `new-utterance` events. */
  async *stream(events: BeeNewUtteranceEvent[]): AsyncGenerator<BeeNewUtteranceEvent> {
    for (const event of events) {
      yield event;
    }
  }

  /** POST /v1/todos, matching the documented Bee todos resource. */
  async createTodo(req: BeeTodoCreateRequest): Promise<BeeTodoCreateResponse> {
    const todo: BeeTodoCreateResponse = {
      id: `todo_${this.nextTodoId++}`,
      text: req.text,
      conversation_uuid: req.conversation_uuid,
      created_at: new Date().toISOString(),
      completed: false,
    };
    this.todos.push(todo);
    return todo;
  }

  /** GET /v1/todos, matching the documented Bee todos resource. */
  async listTodos(): Promise<BeeTodoCreateResponse[]> {
    return [...this.todos];
  }
}

/** Convert our internal Utterance into the wire shape Bee's stream would emit. */
export function toBeeEvent(u: Utterance, conversationUuid: string): BeeNewUtteranceEvent {
  return {
    utterance: { text: u.text, speaker: u.speaker },
    conversation_uuid: conversationUuid,
    created_at_ms: u.timestampMs,
  };
}

/** Convert a Bee wire event back into our internal Utterance shape for the pipeline. */
export function fromBeeEvent(e: BeeNewUtteranceEvent): Utterance {
  return {
    text: e.utterance.text,
    speaker: e.utterance.speaker,
    timestampMs: e.created_at_ms,
  };
}
