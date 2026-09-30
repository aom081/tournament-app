# Phase 4B — Swiss Pairing Candidate Generation

Scope: deterministically enumerating the pool of *legal* pairing
candidates (same-score and cross-score), bye candidates, and their
side-assignment/float metadata. **This phase does not select a final
matching for the round.** Choosing which candidates to actually use —
resolving an odd bracket, deciding who really gets the bye, running a
matching algorithm over the candidate pool — is "the optimizer,"
explicitly deferred to a later phase.

## 1. Additive changes to Phase 4A (no regressions)

Two fields were added to Phase 4A's shared types, both non-breaking:

- **`ParticipantPairingProfile.tpn: number`** — Tournament Participant
  Number, a stable integer used as this phase's primary tiebreaker
  (see §2). It's a new *required* field, so Phase 4A's five existing
  test files' local `profile()` fixture helpers needed a one-line
  mechanical addition (`tpn: 0` as the default) to keep compiling —
  this changes no behavior; it was verified by re-running Phase 4A's
  full 44-assertion suite after the edit (still 44/44).
- **`PairingCandidate.sideAssignment?: SideAssignment`** — made
  **optional** specifically so Phase 4A's existing candidate-building
  test fixtures didn't need to change at all.

`groupByScore` (Phase 4A, `grouping.ts`) gained an optional second
parameter, `compareFn`, defaulting to Phase 4A's original comparator —
existing call sites are unaffected; Phase 4B passes its own comparator
(§2) instead of writing a second grouping implementation.

Phase 4A's original `compareParticipantsForPairingOrder` (score →
seed → id) was **left untouched**, not replaced. Phase 4B's ordering
rule is a new, separate function.

## 2. Deterministic ordering: score descending, TPN ascending

```ts
compareParticipantsByScoreThenTpn(a, b) // ordering.ts
```

Compares score (descending), then `tpn` (ascending); a
tournamentParticipantId string comparison is included as a final
defensive fallback purely for the degenerate case of a duplicate TPN
in malformed input — TPNs are expected to be unique, so this should
never actually be reached in practice, but it keeps the sort total and
deterministic even if that expectation is violated.

This is deliberately a separate function from Phase 4A's
`compareParticipantsForPairingOrder`, not a replacement — see §1.

## 3. Generation order: same-score first, cross-score when needed

`generateCandidates(input: SwissPairingInput): GeneratedCandidates`
(`candidates.ts`) does, in order:

1. Filter to `active` participants, then deduplicate by
   `tournamentParticipantId` (see §6) — the "prevent invalid
   participants" guard.
2. Sort with `sortParticipantsByScoreThenTpn` and group with
   `groupByScore(sorted, compareParticipantsByScoreThenTpn)`.
3. **Same-score candidates**: every unique pair *within* each score
   group.
4. **Cross-score candidates**: every pair drawn from two *different*
   score groups, subject to the same hard-constraint check (which
   includes the `CrossScorePolicy` gate from Phase 4A).
5. **Bye candidates**: one per eligible participant (Phase 4A's
   `isEligibleForBye`), stamped with `input.roundNumber`.

Same-score candidates are computed first and returned in a separate
array from cross-score candidates specifically so a future optimizer
can prefer them without needing to re-inspect each candidate's
`sameScoreGroup` flag — the separation itself encodes "generate
same-score first."

## 4. Self-pairing / duplicate-pair prevention (structural, not filtered)

Both `generateSameScoreCandidates` and `generateCrossScoreCandidates`
iterate with `i < j` (over members within a group, and over group
*pairs*, respectively). This makes two things structurally impossible
rather than something to filter out afterwards:

- A participant can never be paired against themselves (`i === j` is
  never reached).
- The same unordered pair can never be emitted twice — once as
  `(memberIds[i], memberIds[j])`, again as `(memberIds[j],
  memberIds[i])`.

## 5. Legal-by-construction candidates: "prevent" means "never emit"

`buildCandidate` runs Phase 4A's `checkHardConstraints` (self-pairing,
inactive participant, prohibited rematch, cross-score policy) and
returns `null` — not a flagged-invalid candidate — the moment any
violation is found. `null` results are filtered out before being added
to the output arrays. This is the literal reading of requirement #5
("**prevent** ... prohibited rematches"): an illegal candidate is
never in the generated pool at all, not merely marked. Every candidate
this generator emits therefore always has
`hardConstraintViolations: []`; that field is kept on the type for
other callers (e.g. validating a manually-proposed pairing under the
`MANUAL` pairing method), not because this generator ever populates it
with anything.

Rematch handling: `input.allowRematches` (from `SwissPairingInput`,
Phase 4A) controls this directly — `false` (the default posture)
excludes any candidate between two participants who have already
played, in both the same-score and cross-score passes;
`true` includes it and marks `isRematch: true` on the resulting
candidate.

## 6. Support for downfloat / upfloat / bye / side candidates

- **Downfloat / upfloat** — new module `float.ts`.
  `determineFloatDirections(a, b)` derives the direction from actual
  scores (the higher-scored participant would be downfloating, the
  lower-scored one upfloating) rather than trusting a caller-supplied
  flag. `computeFloatRepeatCount(a, b)` checks each participant's
  *most recent* `floatHistory` entry against the direction this
  candidate would assign them, returning `0`, `1`, or `2` — this is
  the piece Phase 4A's docs explicitly flagged as not yet implemented
  ("Float *decisions* are not implemented"), now filled in as
  candidate-generation metadata (it still doesn't decide who actually
  floats — see §7).
- **Bye candidates** — `generateByeCandidates` (added to Phase 4A's
  `bye.ts`, reusing `isEligibleForBye` rather than a new eligibility
  check) returns one `ByeAssignment` per eligible participant, not a
  single chosen recipient.
- **Side/color candidates** — every generated pairing candidate's
  `participantAId`/`participantBId` are set directly from Phase 4A's
  `determineSideAssignment(a, b)`, and the full `SideAssignment` is
  attached as `sideAssignment`. This was a deliberate design choice:
  "A" and "B" on the emitted candidate are never an artifact of
  which participant the generator happened to visit first in its
  loops — they always mean "assigned side A" / "assigned side B".

## 7. What is *not* in this phase (the optimizer)

- **No selection of a final matching.** For a score group of size N,
  every one of the C(N,2) possible pairs is generated — the fact that
  a group of odd size can never have *all* its members simultaneously
  paired within the group is a fact about the *selection* problem, not
  something this phase resolves or even detects structurally (see the
  "odd score group" tests, which assert exactly this: generation
  produces the full candidate set regardless of parity).
- **No bye selection.** All eligible participants get a bye
  *candidate*; picking the one actual recipient (conventionally the
  lowest-ranked eligible participant, and the fallback logic for when
  nobody is eligible) is unimplemented, same as Phase 4A left it.
- **No bracket/float resolution algorithm.** There is no function that
  looks at an odd bracket and decides "this specific participant
  floats down to pair with that specific participant in the bracket
  below." Cross-score candidates are generated exhaustively (subject
  to the policy gate); choosing among them is the optimizer's job.
- **`floatHistory` is never written by this phase.** `float.ts` only
  reads it to compute `floatRepeatCount` for a *proposed* candidate.

## 8. Determinism guarantees

Per the explicit constraints (no DB row order, no object/Map key
order, no `Math.random()`, no Promise-timing dependence):

- The only ordering-relevant operations are `Array.prototype.sort`
  calls with the explicit, tested comparators from `ordering.ts`.
- The `byId` lookup structure is a `Map`, but it is **only ever
  queried by an id already fixed by an already-sorted array** (e.g.
  `group.memberIds[i]`) — its own iteration order is never consulted,
  and `Map.get` doesn't depend on insertion order regardless.
- `generateCandidates` is a plain synchronous function: no `Promise`,
  no `async`, so there is no "timing" for output order to depend on.
- Verified directly by test: running `generateCandidates` on the
  identical input twenty times in a row produces byte-for-byte
  identical output every time, and running it on the same
  participants supplied in a different array order produces identical
  output too.

## 9. Known limitations / explicitly deferred

- Everything in §7 (the optimizer/selection layer).
- **TPN uniqueness is assumed, not enforced.** Unlike duplicate
  `tournamentParticipantId`s (actively deduplicated — see §"invalid
  participants" in §5/§3 step 1), a duplicate `tpn` value across two
  different participants is not detected or rejected here; ordering
  remains deterministic regardless (via the id fallback in §2), but
  assigning TPNs correctly and uniquely is an input-construction
  concern for whatever service eventually builds a `SwissPairingInput`
  from real tournament data (not yet implemented — this phase, like
  4A, is pure domain logic with no Prisma/service wiring).
- **Large tournaments generate a large candidate pool.** Cross-score
  generation is a full cross-product between every pair of score
  groups (subject to the policy gate); this phase makes no attempt at
  performance optimization (e.g. only considering adjacent score
  groups) — that's an optimizer-phase concern once real performance
  characteristics are known, not a candidate-generation one per
  working rule #6 (don't implement future phases).

## 10. Tests

Two new test files, all pure-function tests (no mocks/fakes needed —
this module still has zero external dependencies, same as Phase 4A):

- **`tests/swiss/float.test.ts`** (8 tests) — direction determination
  (equal score → none; higher→DOWN/lower→UP; symmetric under argument
  swap) and repeat counting (0 for same-score; 0/1/2 for cross-score
  depending on history; only the most recent history entry is
  consulted).
- **`tests/swiss/candidates.test.ts`** (24 tests), one `describe`
  block per required category:
  - *Same-score group*: exactly C(N,2) unique pairs, no self-pairs, no
    duplicate unordered pairs.
  - *Odd score group*: an odd-sized group still yields its full
    C(N,2) same-score candidate set, and bye candidates are available
    for every eligible member.
  - *Cross-score*: generated when the policy allows it (with correct
    count and score difference), suppressed entirely when
    `enabled: false`, excluded above `maxScoreDifference`, included
    within it, and `floatRepeatCount` is populated (not left as a
    placeholder).
  - *Rematch*: excluded by default (both same-score and cross-score),
    included and flagged `isRematch: true` when `allowRematches` is
    set.
  - *Bye*: excludes an already-byed or inactive participant; stamps
    the correct round number.
  - *Deterministic ordering*: the score-desc/TPN-asc sort directly;
    identical output across repeated calls (including 20 back-to-back
    runs) and across differently-ordered input arrays; the TPN
    tiebreak winning over alphabetical id order specifically.

### Verification performed this phase

Same offline constraint as every prior phase (no network access, so
Jest itself can't run via `npm test`):

- `tsc --noEmit` across the full backend including both new test
  files: zero errors attributable to this phase's changes — exact same
  baseline error count as before this phase touched anything.
- Re-ran Phase 4A's original 44-assertion `tsx` verification harness
  after the additive type changes in §1: still 44/44, confirming no
  regression.
- Re-implemented both new test files' assertions (32 total: 8 for
  `float.ts`, 24 for `candidates.ts`) as plain-Node harnesses and ran
  them directly against the real source with `tsx`: **32 of 32
  passed**. Combined with the Phase 4A regression check, **76 of 76**
  assertions passed across this phase's full verification.
- **Not done, and not claimed:** no assertion beyond what's listed
  above — no optimizer, no bye selection, no bracket-resolution
  algorithm, none of which exist yet.

## 11. Recommended next phase

**Swiss Pairing Optimizer** — consume `generateCandidates`'s output to
actually select a complete, legal matching for a round: resolve
brackets left with an odd resident count (choosing which participant
floats and in which direction, now informed by `floatRepeatCount`),
select the single bye recipient among `byeCandidates` when needed, and
run a selection/search procedure over `sameScoreCandidates` +
`crossScoreCandidates` using Phase 4A's `comparePairingCandidates` to
choose among otherwise-tied legal options. At that point `PairingRun`
(Phase 4A, still a TypeScript type only) becomes worth persisting as a
real Prisma table, since there will finally be a concrete result to
store and route through organizer review.
