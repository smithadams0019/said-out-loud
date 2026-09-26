# Said Out Loud

Captures only what was announced in class and never written down: the deadline that
moved, the room change, "this will be on the exam," the answer to another student's
question. Nothing else. A student confirms each one before it goes anywhere.

See `SPEC.md` for the full design, including why it deliberately does not transcribe or
summarize, why a model classifies but never writes, and how the consent record is built.

## What this is

A TypeScript MCP server (Node 24+, `@modelcontextprotocol/sdk`) with two terminal screens
of its own. Classification runs on Amazon Bedrock. Bee is mocked at the documented `/v1/*`
boundary, because every real Bee developer path (`bee-cli`, `bee proxy`, the MCP server,
the Skill) requires `bee login`, which needs the iOS app.

## Run it

```bash
git clone <this-repo-url> && cd said-out-loud
npm install                # not --omit=dev; the demo and server run TypeScript via tsx
npm run build              # type-checks and compiles to dist/
npm test                   # 237 tests, 14 skipped, node's built-in runner, no AWS needed
npm run demo               # the one command that carries the demo (~45s, live Bedrock)
npm run demo -- --offline  # the same thing with the model off, instantly
npm run review             # the student's screen: the queue, one sentence at a time
npm run repl                # the REPL — open a session, play it, work the queue at your own pace
node src/repl.ts find "..."  # or one command, straight from the shell, no prompt
npm start                  # the MCP server on stdio
```

`npm run demo` opens a session inside an institutional policy, prints the consent record
first, replays a mocked class with each decision printed as it is made, closes the
session, clears the review queue, shows the instructor's view, scores Bedrock against the
regex rules on hand-labelled sentences, and verifies the consent chain. Add
`-- --print-certificate` for the exportable page.

## Run the REPL

`npm run demo` is a script: one class, played once, then it exits. `npm run review` is a
single y/n/s/q pass. The REPL is the shape between them — the one a student actually
uses after a class, at their own pace, more than once: `open` a session, `play` the
class, work the `queue`, `confirm` or `reject` each captured item, `find` what any past
session of the course confirmed weeks later, pull the `digest` an instructor would see,
and get the `certificate` and `verify` its hash chain. Tab-completes command names,
policy ids and the row ids waiting in the queue; every command also runs one-shot from
the shell exactly as it would at the prompt.

Commands: `policies`, `open [policyId]`, `play`, `queue`, `confirm <rowId>`,
`reject <rowId>`, `find <words>`, `digest`, `certificate`, `verify`, `status`, `help`,
`clear`, `exit`. Drawn from what a student does with this app, not a generic CLI
vocabulary — a sibling Bee project's REPL is a decision log that ends in a git commit,
with a deliberately different set, chosen because that app's job is not this one's.

The REPL persists to `.said-out-loud-repl/ledger.jsonl` by default (the same
`SAID_OUT_LOUD_HOME` shape the MCP server already uses, just defaulted instead of left
off), so a second `node src/repl.ts queue` invocation — a fresh process — sees what an
earlier `open`/`play` produced, and resumes the most recently opened session
automatically rather than asking you to announce one all over again.

Screenshots of every screen are in `docs/screenshots/`, and the raw output of the run they
came from is in `docs/demo-output.txt`. Regenerate both with `npm i --no-save playwright-core && node tools/shoot.mjs`, which runs
the real commands and photographs their real output. `playwright-core` is not a dependency
of the product; it exists only to turn a terminal into a PNG.

## Amazon Bedrock, and what it is and is not allowed to do

The model makes one decision: is this utterance an announcement that was never going to be
written down? That is a judgement call a regex is genuinely bad at, and it is the whole
product. "The deadline moved to Friday" is one; "today we will cover recursion" is not.

The model is not allowed to write anything. It returns a category from a closed list, a
rationale from a closed list of ten codes, a confidence number, and two character offsets
into the utterance. `src/composition-guard.ts` walks the whole response and rejects any
string that is not a vocabulary member, including strings in fields we do not read, so a
model that smuggles a summary into an extra key loses the entire verdict. An unknown enum
member, an offset that is not a whole number in range, and a confidence that is not a
number between 0 and 1 all refuse the verdict rather than falling back to a default: the
classification then comes from the keyword rules and the row says so.

The quote is sliced locally from the utterance using the offsets, and the span is snapped
outward to the sentence boundaries around it — never inward, because trimming could cut a
negation. On ordinary punctuated speech the stored quote is therefore one or more complete
sentences the room heard. The outward snap is bounded at 160 characters a side: a long
turn with no full stop anywhere in it, which is what an auto-transcript of a monologue
looks like, otherwise let the model's ten-character span surface the entire turn. Bounded,
it selects a window of that turn instead. Either way the quote is a verbatim substring of
what was said, and there is no path by which text a model produced reaches the student.

That matters because the product's argument is that a service which produces a student's
notes for them does not restore the learning it replaces. An argument like that cannot
rest on a prompt asking the model to behave. It rests on a validator and a test that hands
the guard a well-formed summary and asserts it is thrown away.

Composing nothing is an argument about the model, not about the bytes. The utterance
itself comes from Bee's transcription and a course id is typed by a person, and both get
rendered, so `src/destinations.ts` escapes for the destination at each boundary rather
than scrubbing once at the top: escape sequences go before anything is printed, and every
field on the consent certificate is flattened to one line, because a course id carrying a
newline used to write a forged `VERIFIED.` line onto the certificate above the real one.
`tests/destinations.test.ts` and `tests/destinations-page.test.ts` push one hostile string
through the terminal, a Bee todo, the digest, the JSONL store, the certificate and all
three shapes of MCP result, and assert on each rendered artefact.

| Setting | Default | Notes |
|---|---|---|
| `SAID_OUT_LOUD_BEDROCK` | unset | `off` switches the model off entirely |
| `SAID_OUT_LOUD_BEDROCK_MODEL` | unset | one id, or a comma-separated chain, replacing the default preference order |
| `SAID_OUT_LOUD_BEDROCK_TIMEOUT_MS` | `8000` | a budget for the whole call, including the one retry |
| `AWS_REGION` | `us-east-1` | |
| `SAID_OUT_LOUD_HOME` | unset | set it to persist the ledger as append-only JSONL |
| `NO_COLOR` / `SAID_OUT_LOUD_COLOR` | unset | `NO_COLOR` wins; `always` forces colour into a pipe |

There is no hard-coded model id. The default is a preference chain, tried in order:
`us.anthropic.claude-haiku-4-5-20251001-v1:0`, then
`us.anthropic.claude-sonnet-4-5-20250929-v1:0`, then `us.anthropic.claude-sonnet-4-6`.
That exists because `ListFoundationModels` advertises models an account cannot actually
invoke: this account lists `anthropic.claude-sonnet-5` and then answers
`AccessDeniedException` when you call it, and bare model ids fail differently again with a
`ValidationException` telling you to use an inference profile. Both refusals are permanent
and neither is knowable before the first call, so the caller walks the chain once, drops
the ids this account cannot use, and keeps the first that answers.

Every Bedrock call has a timeout, one retry on a throttle inside the same budget, and a
fallback to the keyword rules on anything else. The ledger row records which classifier
decided and, if it was the rules, why: `bedrock_timeout`, `bedrock_throttled`,
`bedrock_unreachable`, `bedrock_malformed_output`, `bedrock_refused_by_guard` or
`bedrock_disabled`. Every captured item says on its face which route decided it and, when
it was the model, which model: "decided by Bedrock, haiku-4-5" or "decided by the keyword
rules (bedrock_throttled)". A student trusting this needs to know whether a judgement came
from a model or from a keyword, so it is printed on every row, stored on the ledger, and
written into the consent chain. The full test suite passes with no AWS credentials and no
network.

Measured on the seventeen hand-labelled sentences in the fixture: Bedrock 17/17, the rules
10/17. Seventeen labels show the shape of the difference and are not an evaluation, which
the demo says on screen.

## The MCP tools

| Tool | Does |
|---|---|
| `list_policies` | The institutional policy templates a session can open under, each with its legal basis, retention period and what it does not cover. |
| `start_session` | Opens a room-scoped session inside a policy and writes the announcement as entry 0 of a hash chain. |
| `ingest_utterance` | Room-scope check, expected-speaker check, then classification. Anything kept lands in the review queue as pending. |
| `end_session` | Closes a session. |
| `get_ledger` | Captured items for a session, with review state and which classifier decided. |
| `search_course` | Per-course history across sessions, by category or by a word in the quote. |
| `list_review_queue` | What is waiting on the student. |
| `confirm_item` | The student agrees. The only path by which a Bee todo can exist. |
| `reject_item` | The student disagrees. No todo; the quote becomes a correction the classifier sees later in that course. |
| `get_room_digest` | What was announced in a room, with no field anywhere for who recorded it. |
| `get_consent_record` | The announcement, the policy, the deletion date and the chain. |
| `export_consent_record` | One plain-text page a student can hand to disability services. |
| `verify_consent_record` | Re-hashes the chain and names the entry where it stops adding up. |

## Consent, and where to see it

The five consent rules below are implemented, not just described:

1. **Room-scoped, not life-scoped**: every session requires a duration cap and a
   retention period. `isWithinSessionWindow` rejects anything outside the window before it
   reaches the pipeline, and before any model sees it. There is a test asserting Bedrock
   is never called for an utterance the consent rules already rejected.
2. **Announce and log**: `startSession()` cannot construct a session without an
   announcement; it becomes entry 0 of the chain, and the chain will not verify without it.
3. **Discard segments with no expected speaker present**: dropped before classification,
   and `DropRecord` has no text field, so the content cannot be stored even by mistake.
   There is a test that writes a session to disk and greps the file for the dropped words.
4. **Sit inside an institution's existing policy**: a session opens against a policy
   template, which supplies the announcement, the speakers and the retention. The four
   that ship are examples written from the regulations they name, not any real
   institution's policy and not legal advice.
5. **Keep text, not audio**: no binary field anywhere in `src/types.ts`; the Bee stream
   shape itself is text-only, matching the real one.

The chain is the part worth clicking. Entry 0 is the announcement; every capture,
confirmation, rejection and close appends to it. Edit the announcement, backdate it,
delete a captured item or reorder the entries and `verify_consent_record` names the entry
where it breaks. `tests/chain.test.ts` tries all four.

Every guard in the app has been run through the mutation check: disabled one at a time,
with the suite re-run, to confirm something goes red. `tests/fixtures/adversarial.jsonl`
carries the nineteen shared adversarial rows verbatim; `tests/adversarial-corpus.test.ts`
offers each of them to the guard as model prose three ways, and
`tests/adversarial-content.test.ts` says for every row this app does not claim which
field it does not have, and names the one hazard it does carry and does not filter.

What the certificate claims is internal consistency and nothing more, and it says so on
its own face: it does not prove the announcement was audible, that anyone heard it, or
that the file was created when it says it was.

## What is mocked, and why it does not help us

Bee is mocked at the documented `/v1/*` boundary: `new-utterance` stream events shaped
`{ utterance: { text, speaker }, conversation_uuid }`, the `conversations`, `facts` and
`todos` resources, and `todos/suggestions`. Nothing above that line is faked. The consent
pipeline, the classifier, the guard and the hash chain all run for real against the
client's responses, and swapping this one file (`src/bee-client.ts`) for an authenticated
`bee-cli` client is the whole of a live integration. It is mocked because every Bee
developer path needs `bee login`, which needs the iOS app.

The thing worth saying about it is that the mock gives this product no advantage. The
model is shown one utterance's text and returns a category, a rationale code, a confidence
number and two character offsets. It never sees a conversation, a session or a speaker,
and it never returns a string anybody reads. So the guard that rejects any unrecognised
string, the offset snapping that stops a mangled quote, and the chain that makes the
consent record tamper-evident would all behave identically against a real device. A live
Bee account would improve the transcript. It would not change a single one of the
behaviours this entry is asking to be judged on.

The fixture transcript at `src/fixtures/session-transcript.json` is labelled mocked data.
Its `label` field is hand-written ground truth used only to score the two classifiers
against each other; nothing in the pipeline reads it.

## Design principle (why this is narrow on purpose)

No lecture transcript. No summary. No auto-generated study notes. No quiz. If a feature
would let a student stop attending or stop taking their own notes, it does not ship. Three
peer-reviewed findings say a service that substitutes for a student's own encoding does
not restore the learning it replaces; see `SPEC.md` for the three findings and the
statutes behind this design. This is also what keeps the product out
of the category Glean/Genio and Otter already sell into: they produce transcripts and
study notes; this produces neither.

## Honest limits

- A hackathon build against a mocked API boundary. It has not been run against a live Bee
  device, because nothing can be: `bee login` needs the iOS app.
- The consent design rests on statutory text (California Penal Code 632, Washington RCW
  9.73.030(3), 28 CFR 35.104/35.160, 34 CFR 104.44) read directly, not on case law
  applying those statutes to a classroom. None was found.
- The policy templates are examples, not any institution's actual policy and not legal
  advice.
- Speaker labels are roles, never identity. Bee and Alexa+ give no voice ID, so this
  product never claims to know who specifically is speaking.
- The classifier comparison is seventeen hand-written labels on one fixture. It shows the
  shape of the difference. It is not an evaluation and the demo says so.
- The demand signal for this exact feature is thin in the research corpus; see `SPEC.md`,
  "Demand honesty". The pitch leads with why the product is designed this way, not with a
  story of someone missing an announcement.

## Licence

MIT.
