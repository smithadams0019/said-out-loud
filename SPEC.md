# Said Out Loud, the spec

## What it does

Inside a declared teaching session, captures only the things that were **announced out
loud and never written down**: a deadline that moved, a room change, "this will be on
the exam," "email me by Friday," the answer to a question another student asked. Each one
is held as a dated ledger row with a verbatim quote, a speaker role and a timestamp, and
waits there until the student confirms it. Confirmed items become Bee todos.

It does not transcribe the lecture. It does not summarize. It does not take notes for
you. A model classifies; a model never writes a word that reaches the student.

## Who for

Students who cannot hold both a notebook and their attention at once: someone reading
captions or watching an interpreter, someone who loses the thread and cannot rewind,
someone whose hands are occupied, someone translating in their head. Also useful to any
student who stepped out for two minutes and missed the one sentence that mattered.

## The design principle, and why it is load-bearing

Three studies say a service that produces the student's notes for them does not restore
the learning it replaces (Flanigan & Titsworth 2020, on complete idea units; Marschark et
al. 2006, on deaf students still scoring below hearing peers even with a perfect
transcript; the 2025 ADHD note-taking study, on note-taking itself being the thing that
helped). So:

- **No transcript of the lecture.** The pipeline never stores or surfaces lecture content
  that isn't one of the five announced-item categories below.
- **No summary, no auto-generated study notes, no quiz.** If a feature would let a student
  stop attending or stop taking their own notes, it does not ship.
- The only thing captured is the category of information a notebook was never going to
  catch anyway, because it happened after the notebook was shut, or interrupted it: an
  announcement.

This is what keeps Said Out Loud out of the category Glean/Genio and Otter already sell
(full transcription plus AI study notes). It captures less, on purpose.

## The model classifies, and never composes

Deciding whether a sentence is an announcement is a judgement call, and it is the whole
product. "The deadline moved to Friday" is one. "Today we will cover recursion" is not.
Both name a time and a piece of the course, both sound procedural, and no pattern
separates them without a list of every phrasing a human might use. Amazon Bedrock is
genuinely better at this than a regex, so Bedrock makes that one decision.

It makes no other decision, and it is structurally prevented from making one.

**How.** The model is asked for JSON with four fields: a `category` from a closed list, a
`rationale` from a closed list of ten codes, a `confidence` number, and two character
offsets into the utterance it was shown. `composition-guard.ts` then walks the whole
parsed response and rejects any string that is not a member of one of those vocabularies,
including strings in fields the product does not read, so a model that tries to smuggle a
summary into an extra key fails the entire verdict rather than having it quietly ignored.
The stored quote is sliced locally out of the utterance using the offsets, and snapped
outward to whole sentences, so a quote is always a complete sentence the room actually
heard. There is no code path by which a string the model produced becomes a string the
student reads.

**Why say it this way.** "We told the model not to summarise" is a prompt, and a prompt is
a request. The design principle above is the reason this product is not Otter, so it
cannot rest on a request. It rests on a type system and a validator, and there is a test
that hands the guard a model output containing a perfectly good summary and asserts the
whole verdict is thrown away.

**What the model is worth.** On the seventeen hand-labelled sentences in the fixture,
Bedrock scores 17/17 and the regex rules score 10/17. The rules produce four false
positives ("That assignment has not moved" reads as a deadline change) and miss three
announcements with no keyword in them at all ("Forget what the syllabus says about the
midterm, it is open book now"). Seventeen hand-written labels are enough to show the
shape of that difference and nowhere near enough to be an evaluation, which the demo says
on screen.

**Operationally.** A preference chain rather than one id, because `ListFoundationModels`
advertises models an account cannot invoke, and the only way to find out is to call one.
Order: Haiku 4.5, then Sonnet 4.5, then Sonnet 4.6, all as `us.anthropic.*` inference
profiles since the bare ids reject on-demand calls. An `AccessDeniedException` or a
`ValidationException` is permanent for an account, so the caller drops that id and takes
the next, once, inside the same deadline. Haiku leads because it was measured faster and,
on this fixture, more accurate than Sonnet 4.5 (median 1.6s against 2.9s), which matters
for something that runs once per utterance in a live room. Every call has a timeout that
is a budget for the whole call, one retry on a throttle inside that budget, and a fallback
to the keyword rules on anything else.

**Every item says which route decided it.** The ledger row carries `source`, the model id
when a model decided, and the `fallbackReason` when the rules did; the chain entry carries
the same; the demo and the review screen print it under every quote in words, never by
colour alone. A student deciding whether to trust a captured deadline needs to know whether
that judgement came from a model or from a keyword match, and showing it is more honest
than a product that reads the same either way. Bedrock off,
absent, slow or broken degrades the product; it never stops it. `npm run demo -- --offline`
runs the whole thing with the model switched off, and the entire test suite passes with
no AWS credentials at all.

## What counts as "said out loud" (the five categories)

1. Deadline change: "the essay is now due Monday, not Friday"
2. Room or location change: "we're moving to room 214 for the rest of the week"
3. Exam signal: "this will be on the exam," "you need to know this for the test"
4. Contact/logistics instruction: "email me by Friday," "bring your ID next time"
5. Relayed answer: the instructor's answer to a question another student asked aloud,
   which the rest of the room may not have heard clearly

Everything else in the stream is discarded before it is written to storage.

## The student confirms everything

Captured items land as `pending`. Nothing leaves the product until the student says yes:
`confirm_item` is the only path by which a Bee todo can exist.

This is an accuracy mechanism and it is the design principle doing work. A queue the
student reads, judges and clears is a short deliberate pass over the five things that
happened around the teaching, which keeps them in the encoding loop rather than handing
them a finished set of notes. A rejection is kept as a `Correction` and shown to the
classifier on later utterances in the same course, so the thing that corrects the model
is the student's own judgement about their own class.

## The consent record

A lecture hall is the one room on this track where the wiretap statute mostly steps
aside. California Penal Code 632(c) excludes from the definition of a confidential
communication anything "made in a public gathering... or in any other circumstance in
which the parties to the communication may reasonably expect that the communication may
be overheard or recorded". A hundred-seat lecture with a recorded stream and a lecture
capture system already bolted to the ceiling is outside 632 on the statute's face, before
anyone announces anything. 632(f) goes further and exempts hearing aids and similar
devices used to overcome an impairment, which is closer to what this is than it is to
surveillance.

So the statute is not the constraint here. The constraint is the institution, and the law
that matters is the accommodation law. 28 CFR 35.104 already names notetakers, real-time
computer-aided transcription and audio recordings as auxiliary aids. 28 CFR 35.160(b)(2)
requires a public entity to "give primary consideration to the requests of individuals
with disabilities". A student using this is not evading a recording rule. They are
exercising a right the institution is obliged to consider, and the product's job is to
look like something a disability services office would recognise and sign.

That is why the announcement is still here when the statute would let it go. The risk to
the student is not prosecution. It is an instructor who finds out sideways, feels
recorded, and has the accommodation narrowed or withdrawn. An announcement made out loud
and kept as the first record is how a student stays on the right side of that
conversation, and Washington RCW 9.73.030(3) supplies the wording of the standard to meet:
consent obtained by announcing "in any reasonably effective manner", provided "said
announcement shall also be recorded".

### The chain, which is only in this app

Every session keeps an append-only SHA-256 chain. Entry 0 is the announcement, then one
entry per capture, per confirmation, per rejection, and one on close. Editing the
announcement, backdating it, deleting a captured item or reordering the entries all break
the chain, and `verify_consent_record` names the entry where it stops adding up.
`export_consent_record` renders the whole thing as one plain-text page.

The chain is here because of who the reader is. This is the only product in the set whose
consent record has an adversarial audience: a disability services officer deciding whether
to keep granting the accommodation, or a committee hearing a grade appeal that turns on
whether a deadline really moved. A record that could have been written afterwards is worth
nothing in that room. Nothing else built on this hardware in this workspace has a hash
chain, and nothing else needs one.

The certificate prints its own limits. It proves the announcement was written before the
items beneath it and that nothing has been edited since. It does not prove the
announcement was audible, that anyone heard it, or that the file was created when it says.
A deployment wanting the stronger claim would co-sign the head hash with the institution's
key. Overclaiming on the one defensible part of the product would be worse than not having
it.

### Policy, not policy-writing

A session opens against a policy template, which supplies the announcement wording, the
expected speakers and the retention period. Four ship: ADA auxiliary aid, Section 504
plan, CART and interpreter services, and departmental recording rules. Each carries its
legal basis and a plain statement of what it does not cover. They are examples written
from the shape of the regulations, not any real institution's policy and not legal advice;
a deployment replaces them with the wording its own disability services office already
publishes. 35.160(b)(2) puts the decision with the institution, so the product carries
policy and does not author it.

Retention follows from the policy rather than from a preference. The template sets the
days, the consent record carries the resulting `deleteAfterMs`, and the sweep enforces it.

### Scope, and what a session will not accept

A session has a start, a hard duration cap and a retention period, and any utterance
outside `[start, end)` is rejected before the pipeline runs and before any model sees it.

Expected speakers are declared by role, never by biometric identity, because Bee gives no
voice ID and claiming otherwise would be claiming a capability the platform does not have.
Anything from another speaker is dropped and never written, and `DropRecord` has no field
for text, so the content cannot be persisted by mistake even by a later edit.

No field anywhere in the type system can hold binary data. Bee's own `new-utterance` shape
is `{text, speaker}`, so this is true of the real integration point rather than only of
our storage.

### What the instructor can see

`get_room_digest` answers the fair question, which is what this thing keeps about their
class. It returns every confirmed announcement captured in a room: a list of sentences the
instructor said out loud to the whole room in the first place.

It returns no student name, no roster, no device and no session id. That is not a filter
applied on the way out. `RoomDigest` has no field for any of them, so a later edit cannot
start leaking one without someone changing the type and noticing. An accommodation the
instructor can see the shape of is one a student can keep using. An accommodation that
tells the instructor who has one is a reason to stop.

## The teacher-side view

`get_room_digest` answers the instructor's fair question, which is what this thing keeps
about their class. It returns every confirmed announcement captured in a room, which is a
list of sentences the instructor said out loud to the whole room in the first place.

It returns no student name, no roster, no device and no session id. That is not a filter
applied on the way out: `RoomDigest` has no field for any of them, so a later edit cannot
start leaking one without someone changing the type and noticing. An accommodation the
instructor can see the shape of is one a student can keep using. An accommodation that
tells the instructor who has one is a reason to stop.

Pending and rejected items never appear. The instructor sees what a student stood behind,
not what a classifier guessed.

## The screens

`npm run demo` is the one command that carries it. It opens a session inside a policy,
prints the consent record first, replays a mocked class utterance by utterance with each
decision printed as it is made, closes the session, clears the review queue, shows the
instructor's view, scores Bedrock against the rules on the labelled sentences, and
verifies the chain. About 45 seconds against live Bedrock, because the pauses are real
round trips. `-- --offline` runs it instantly with the model off. `-- --print-certificate`
appends the exportable page.

`npm run review` is the student's screen: the queue, one sentence at a time, `y`/`n`/`s`/`q`.
Deliberately the whole interaction. Somebody who has just sat through a class should be
finished in under a minute and should have read every sentence on the way.

## Visual direction

A ruled ledger page, which is what this product keeps: a small number of numbered entries
and the proof of when they were written. A left margin rail runs down every line, sections
open with a rule hanging off it, entries are numbered in sequence, and the consent record
sits at the top because it has to be read before anything else.

Colours in words: ink blue for the rails and rules, chalk white for anything the room
actually heard, graphite for machinery, moss green for confirmed, clay red for dropped and
rejected, heather for waiting on the student. Nothing is colour-only; every state carries
a word as well, and the whole palette drops out under `NO_COLOR` or when the output is not
a terminal.

## What it deliberately does not do

- No lecture transcript, ever, of anything outside the five categories.
- No summarization, no study guide, no quiz generation.
- No model-written text anywhere in the product, enforced by a validator rather than
  requested in a prompt.
- No speaker identity beyond a declared role label. Bee and Alexa+ give no voice ID, so
  treating a label as identity would be a claim the platform cannot back.
- No audio storage or playback.
- No life-scoped or always-on capture. Every session has a declared end and a deletion
  date.
- No automatic todo. A person confirms every item.
- No claim of legal certainty. The consent design follows the statute text, and the
  underlying research itself flags that no court applying an all-party-consent statute
  to a classroom was found. That gap is real and is stated here, not hidden.

## Demand honesty

Across 1,692 archived posts sampled from eleven subreddits (r/deaf, r/hardofhearing,
r/ADHD, r/Dyslexia, r/college, r/GradSchool, r/Professors, r/Teachers, r/StudentNurse,
r/nursing, r/languagelearning) and hand-coded down to 34 confirmed on-topic posts, zero
were specifically about a missed announcement costing someone something. Fifteen were
people hunting for a transcription tool (the product this spec deliberately is not) and
eighteen were about fighting the accommodation process. Nobody posts "I missed the room
change and it cost me." The pitch has to lead with the underlying research evidence (the
three studies on why a transcript-shaped product does not restore learning, and the case
law establishing the cost of getting this wrong), not with an anecdote this research did
not find.

## Stack

TypeScript on Node 24+. Ships as an MCP server (`src/server.ts`,
`@modelcontextprotocol/sdk`) exposing thirteen tools: `list_policies`, `start_session`,
`ingest_utterance`, `end_session`, `get_ledger`, `search_course`, `list_review_queue`,
`confirm_item`, `reject_item`, `get_room_digest`, `get_consent_record`,
`export_consent_record`, `verify_consent_record`. The same functions are called by the
demo, the review screen and the test suite, so there is one code path.

Classification is Amazon Bedrock via `@aws-sdk/client-bedrock-runtime` Converse, with the
regex rules as the fallback. Storage is in memory by default, or append-only JSONL under
`SAID_OUT_LOUD_HOME` when one is configured, which suits a hash chain: rows are written
once and never edited in place.

Bee is mocked at the `/v1/*` request/response boundary (`src/bee-client.ts`), matching the
shapes documented for `bee stream` (`new-utterance` SSE events) and the
`conversations`/`facts`/`todos` resources. The mock is labelled in code and in the README;
nothing above that boundary is faked. The consent rules, the pipeline, the guard and the
classifier all run for real against the mocked wire shape.
