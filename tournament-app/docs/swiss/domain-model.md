# Phase 4A — Swiss Pairing Domain Model

Scope: the vocabulary and constraint-checking primitives a future
Swiss pairing engine will be built from. **This phase does not decide
any pairings.** There is no function anywhere in
`src/domain/swiss/` that takes a full round of participants and
returns "here is who plays whom" — that is explicitly deferred to a
later phase ("the pairing algorithm").

> **Scope note:** Phase 3 (Tournament Lifecycle) was requested earlier
> but never completed — only the existing schema was inspected before
> work moved to this phase. This module has no dependency on Phase 3's
> planned lifecycle states or configuration; it operates entirely on
> abstract participant/score inputs. Phase 3 remains an open,
> unstarted item.

## 1. Why domain model first, algorithm later

A production-grade Swiss engine has to get several genuinely tricky
things right at once: score-group formation, floating players between
groups when a group has an odd size, bye eligibility, rematch
avoidance, review triggers, and deterministic output. Building the
*vocabulary* for these concepts first — as plain, dependency-free
TypeScript types plus narrow, individually-testable predicate/utility
functions — means:

- The eventual algorithm can be built and tested against a stable,
  already-verified foundation, rather than inventing types and rules
  simultaneously with the search logic.
- Every rule below is independently unit-tested *now*, so bugs in
  "is this pairing legal" or "which side should each participant
  play" can't hide inside a large, hard-to-test search function later.

## 2. Module layout

All under `backend/src/domain/swiss/`, zero external dependencies
(no Express, no Prisma, no npm packages at all):

| File | Contents |
|---|---|
| `types.ts` | Every noun in the required concept list. |
| `ordering.ts` | Deterministic participant ordering; lexicographic (non-weighted) candidate comparison. |
| `grouping.ts` | `groupByScore`, `createInitialBracket` — pure structural grouping. |
| `constraints.ts` | Hard-constraint checks and `CrossScorePolicy` evaluation. |
| `bye.ts` | Bye *eligibility* checking (not selection). |
| `side.ts` | Side/color-preference assignment for an already-formed pair. |
| `index.ts` | Barrel re-export. |

## 3. Concept-by-concept mapping

- **`SwissPairingInput`** — the full, explicit input to one pairing
  run: tournament id, round number, every participant's
  `ParticipantPairingProfile`, the `CrossScorePolicy`, the
  `preferenceOrder` (soft criteria), and `allowRematches`. Nothing is
  read from a hidden data source — a run is fully reproducible from
  this object.
- **`ScoreGroup`** — participants sharing an identical score, formed
  by `groupByScore`. Purely structural; makes no pairing decisions.
- **`PairingBracket`** — the *working set* for one pairing iteration:
  a score group's own ("resident") members plus anyone floated in
  from elsewhere. `createInitialBracket` only performs the trivial
  "wrap a fresh score group as a bracket with no floats yet" step —
  deciding who actually floats into a bracket is algorithm work.
- **`Float` / `FloatDirection`** — modeled as `FloatHistoryEntry`
  (round + direction) on each participant's profile, so the engine (or
  the soft-preference comparator) can check "did this participant
  float the same direction last round" without recomputing history.
  No function in this phase decides whether/where to float anyone.
- **`ByeAssignment`** — a participant + round pairing. `isEligibleForBye`
  and `checkByeAssignment` only check whether a *specific, already
  proposed* candidate is legal (active, hasn't had a bye yet); neither
  function chooses *which* eligible participant should get it when
  several qualify, or handles the fallback when nobody is eligible —
  both are ranking/algorithm decisions for later.
- **`PairingCandidate`** — one proposed pairing, carrying both the
  facts needed to check hard constraints
  (`hardConstraintViolations`) and precomputed facts needed to rank
  already-valid candidates (`floatRepeatCount`,
  `sideBalanceImprovement`). See §4 for why these stay separate.
- **`PairingResult`** — the finalized output shape for a round
  (`FinalizedPairing[]` + `bye` + `floats` + review flags). Nothing in
  this phase produces one from a real participant list; it's the
  target shape the algorithm phase will populate.
- **`PairingRun`** — the auditable wrapper (input + result + review
  status + timestamps) matching the "Organizer Review" step of the
  architecture. **Modeled as a TypeScript type only in this phase, not
  a Prisma table** — see §6.

## 4. Hard constraints vs. soft preferences are never blended

This was an explicit requirement, and it shapes the whole module:

- **Hard constraints** (`checkHardConstraints`,
  `evaluateCrossScorePolicy`'s `allowed` field) return a list of
  `HardConstraintViolation`. An empty list means "legal"; a non-empty
  list means "illegal, full stop." There is no numeric penalty, no
  threshold, no way for enough soft preference to overcome a hard
  violation — the type system doesn't even offer a slot to add one in.
- **Soft preferences** (`SoftPreferenceCriterion`, consumed by
  `comparePairingCandidates`) only ever compare two *already-valid*
  candidates, and do so **lexicographically**: the first criterion in
  `preferenceOrder` is checked; only on an exact tie does the next one
  get consulted. A later criterion's magnitude can never outweigh an
  earlier one — this is structurally different from, and was chosen
  instead of, computing one weighted score per candidate and sorting
  by it. `tests/swiss/ordering.test.ts` includes a test that proves
  this directly: a candidate that is dramatically "worse" on every
  criterion except the first still sorts ahead of one that's better on
  everything but the first, whenever the first criterion is
  `PREFER_SAME_SCORE_GROUP`.
- **`CrossScorePolicy.requireOrganizerReview`/`reviewThreshold`** are
  informational only. `evaluateCrossScorePolicy` returns `allowed` and
  `requiresReview` as two independent booleans; `requiresReview` can
  be `true` on a pairing that is otherwise completely valid, and it
  never appears anywhere near the hard-constraint violation list.

## 5. Determinism

Two mechanisms guarantee that running the (future) engine twice on
identical input produces identical output:

- `compareParticipantsForPairingOrder` / `sortParticipantsDeterministically`
  — canonical ordering by score (desc), then seed (asc, unseeded
  last), then `tournamentParticipantId` (asc) as an always-available
  final tiebreaker. `groupByScore` uses this internally.
- `comparePairingCandidates` — even with an empty `preferenceOrder`,
  or after every configured criterion ties, it falls back to a string
  comparison of the two participant ids, so candidate ordering is
  never left to object-insertion order or floating-point instability.

## 6. Known limitations / explicitly deferred

- **`PairingRun` is not persisted.** It's a plain TypeScript type in
  this phase. A Prisma migration for it is deliberately deferred until
  the actual engine (which would be the only real writer of one)
  exists — adding a table nothing writes to yet would be a speculative
  schema change ahead of the logic that needs it.
- **No actual pairing algorithm.** There is no function that takes a
  full round's worth of participants and produces a complete,
  legal `PairingResult`. Building score-group brackets that carry
  floats across iterations, resolving an odd-sized bottom bracket,
  and searching for a maximal legal pairing set within a bracket are
  all open work for the next Swiss phase.
- **Bye *selection* is not implemented**, only eligibility checking.
  Choosing which eligible participant should get the bye (typically
  the lowest-ranked eligible one) — and what happens if *no one* is
  eligible (e.g. everyone has already had a bye) — is algorithm work.
- **`computeSideBalanceImprovement` is a heuristic, not a guarantee.**
  A single pairing only ever adjusts one count on each side by one, so
  the result can legitimately be zero or negative (e.g. two
  already-perfectly-balanced participants paired together will always
  come out slightly less balanced afterwards — no assignment avoids
  that). The soft-preference comparator only uses it to *rank*
  pairings relative to each other; it is never a pass/fail gate, and
  no other function depends on it being positive.
- **Float *decisions* are not implemented.** `FloatHistoryEntry` lets
  the model *record and consult* float history, but no function here
  decides that a given participant should float, or in which
  direction.

## 7. Tests

Five focused Jest test files under `backend/tests/swiss/`, one per
module, covering every explicitly required capability:

- **`ordering.test.ts`** — score-descending sort, seed tiebreak,
  full-tie determinism and input-order independence; and, critically,
  a direct proof that lexicographic comparison does not blend
  criteria (a candidate "worse" on every later criterion still wins on
  the first).
- **`grouping.test.ts`** — score grouping (including exclusion of
  inactive participants) and bracket construction (including that it
  doesn't mutate its input).
- **`constraints.test.ts`** — same-score pairing (always allowed),
  cross-score pairing (allowed/rejected/review-flagged per policy),
  maximum score difference (hard rejection), rematch prevention (with
  and without the `allowRematches` override), self-pairing rejection,
  inactive-participant rejection.
- **`bye.test.ts`** — eligibility for active/no-prior-bye,
  ineligibility for already-had-bye/inactive/unknown-id.
- **`side.test.ts`** — side/preference assignment tie-break sequence
  (count → last-side → id) and the balance-improvement heuristic.

### Verification performed this phase

Same environment constraint as prior phases: no network access, so
Jest itself could not be installed or run via `npm test`. Unlike
every previous phase, though, this module has **zero** external
dependencies at all (no Express, Prisma, bcryptjs, or jsonwebtoken),
so it did not need the dependency-injection workaround Phases 2–3
relied on for offline testing:

- `tsc --noEmit` over the full backend (including all five new test
  files, via a temporary tsconfig that includes `tests/`): **zero**
  errors attributable to this module — the only remaining errors are
  the same pre-existing "missing node_modules" noise from before this
  phase touched anything.
- Re-implemented all 30 individual assertions from the five Jest test
  files as a plain-Node harness and ran it directly against the real
  source files with `tsx` (no Jest, no mocks, no fakes needed —
  genuinely the same code path): **44 of 44 assertions passed**
  (one initial failure was traced to a flawed assumption in the
  *test's* example numbers for the side-balance heuristic — the
  heuristic's own behavior was correct; the test was corrected and the
  docstring in `side.ts` was tightened to describe the actual,
  narrower guarantee it provides).
- **Not done, and not claimed:** no assertion beyond what's listed
  above — in particular, nothing about an actual pairing algorithm,
  since none exists yet.

## 8. Recommended next phase

**Swiss Pairing Engine** — consume this domain model to actually
generate a `PairingResult` for a round: build `PairingBracket`s from
`ScoreGroup`s, decide floats when a bracket has an odd resident count,
enumerate `PairingCandidate`s within/across brackets using
`checkHardConstraints` and `evaluateCrossScorePolicy` to filter, use
`comparePairingCandidates` to select among valid ones, assign a bye
via an actual selection rule (not just eligibility), and assign sides
with `determineSideAssignment`. At that point, `PairingRun` becomes a
real Prisma table (input snapshot + result snapshot + review status),
since there will finally be a real writer for it.
