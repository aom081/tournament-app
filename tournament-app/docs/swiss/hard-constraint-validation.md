# Phase 4C — Swiss Hard Constraint Validation

Scope: a dedicated validation layer that takes a *proposed* pairing
(a single pair, or a complete round) and returns Valid/Invalid plus
diagnostics naming the specific rule violated. This module validates
proposals; it does not generate or select them — that remains
Phase 4B (generation) and the still-unbuilt optimizer (selection),
respectively.

```
Candidate -> Hard Constraint Validator -> Valid / Invalid -> Diagnostics
```

## 1. Two validation levels

Some of the nine listed hard constraints are properties of a single
**pair** (self-pair, valid participant, legal opponent, valid side
assignment); others only make sense about a **complete round**
proposal (no participant appears twice, valid bye, complete legal
pairing). The API mirrors this directly rather than forcing everything
through one function:

- **`validatePair(participantAId, participantBId, sideAssignment, context)`**
  — validates one proposed pair.
- **`validateRoundPairing(proposed, context)`** — validates a complete
  proposed round (`{ pairs, bye }`): runs `validatePair` on every pair,
  checks the bye, and adds the two round-only checks (duplicates,
  completeness).
- **`assessPairingFeasibility(input)`** — a narrower, separate
  question: "does *any* legal pairing/bye exist at all for this
  input?" (see §5).

Both `validatePair` and `validateRoundPairing` return the same shape:

```ts
interface ValidationResult {
  valid: boolean;
  violations: HardConstraintViolation[]; // empty iff valid
}
```

reusing Phase 4A's `HardConstraintViolation` type — diagnostics are
never a generic "invalid" boolean; every entry names a specific
`type` (see §2) plus a human-readable `message` and the
`participantIds` involved.

## 2. Requirement → diagnostic code mapping

| Requirement | Diagnostic code | Where checked |
|---|---|---|
| No self-pair | `SELF_PAIRING` | `validatePair` |
| Valid participant | `UNKNOWN_PARTICIPANT` (id not in roster) or `PARTICIPANT_INACTIVE` (found but inactive) | `validatePair` |
| No prohibited rematch | `REMATCH` | `validatePair` (delegates to Phase 4A's `checkHardConstraints`) |
| Configured maximum score difference | `SCORE_DIFFERENCE_EXCEEDED` | `validatePair` |
| Legal opponent (categorical, not numeric) | `CROSS_SCORE_NOT_ALLOWED` | `validatePair`, when `crossScorePolicy.enabled` is `false` |
| Valid side/color assignment where absolute | `INVALID_SIDE_ASSIGNMENT` | `validatePair`, only when a `sideAssignment` is actually present (see §3) |
| No participant appears twice | `DUPLICATE_PARTICIPANT_IN_RESULT` | `validateRoundPairing` |
| Valid bye | `INVALID_BYE_RECIPIENT` | `validateRoundPairing` (delegates to Phase 4A's `checkByeAssignment`) |
| Complete legal pairing | `MISSING_PARTICIPANT_IN_RESULT` (plus every pair/bye violation already listed) | `validateRoundPairing` |

Two of these codes — `DUPLICATE_PARTICIPANT_IN_RESULT` and
`MISSING_PARTICIPANT_IN_RESULT` — were declared in Phase 4A's
`HardConstraintType` union but never used by any Phase 4A/4B code;
Phase 4A's own docs anticipated exactly this round-level validation
need. This phase only had to add two genuinely new codes,
`UNKNOWN_PARTICIPANT` and `INVALID_SIDE_ASSIGNMENT` (confirmed safe:
grepped the codebase first for any exhaustive `switch` over
`HardConstraintType` that a new union member could break — there are
none).

**"Legal opponent" was deliberately not given its own catch-all
code.** A generic `ILLEGAL_OPPONENT` would be *less* diagnostic than
naming the actual rule (`REMATCH` vs. `SCORE_DIFFERENCE_EXCEEDED` vs.
`CROSS_SCORE_NOT_ALLOWED`) — and the brief's own wording,
"Diagnostics must identify the actual violated rule," argues directly
against a vague bucket category.

## 3. Hard vs. soft constraints are still never combined

Per the explicit requirement, this layer only ever produces a binary
valid/invalid plus a list of specific violations — never a blended
score. `validatePair` reuses Phase 4A's `checkHardConstraints` (which
already keeps hard rejection separate from soft ranking) rather than
introducing any new scoring. The soft-preference comparator from
Phase 4A (`comparePairingCandidates`) is untouched by this module and
is not called from anywhere in it.

"Valid side/color assignment **where absolute**" is implemented
literally: `validateSideAssignment` returns no violations at all when
`sideAssignment` is `undefined` — the rule only fires when a side
assignment is actually present (i.e., "absolute"/given) and internally
inconsistent (references a participant outside the pair, or assigns
both sides to the same participant). A pairing format with no
side/color concept never trips this rule.

## 4. Round-level checks: aggregate, not first-failure

`validateRoundPairing` collects violations from **every** pair, the
bye, the duplicate check, and the completeness check — it does not
stop at the first problem found. This means a single proposal can
surface multiple distinct diagnostics at once (e.g. one pair being an
illegal rematch *and* a different participant being missing entirely
are both reported together), tested explicitly (see §6). `valid` is
`true` if and only if the combined `violations` array is empty.

## 5. Feasibility: a deliberately conservative "no legal pairing" check

`assessPairingFeasibility(input)` answers a narrower question than
"does a complete matching exist" (a genuine matching-existence
problem, which needs an actual algorithm — optimizer-phase work, out
of scope here). It reuses Phase 4B's `generateCandidates` and reports
`feasible: false` **only** in the total-dead-end case: there are
active participants, but not a single same-score candidate,
cross-score candidate, or bye candidate can be generated at all.

This is intentionally conservative: a `feasible: true` result is *not*
a guarantee that some combination of the generated candidates actually
covers every participant — only that generation didn't hit the
complete-dead-end case. Detecting the subtler kind of infeasibility
(individual candidates exist, but no combination of them forms a
complete legal pairing) requires solving the matching problem itself,
which is exactly "the optimizer" this phase and Phase 4B both
explicitly declined to build.

## 6. Tests

`tests/swiss/validation.test.ts`, one `describe` block per required
adversarial category (25 tests total):

- **Self-pair** — `SELF_PAIRING`, and nothing else reported.
- **Rematch** — rejected by default; accepted (and `isRematch`-style
  behavior preserved) when `allowRematches: true`.
- **Illegal opponent** — a cross-score pairing rejected purely because
  `crossScorePolicy.enabled` is `false`, with a small (non-rematch)
  score gap, explicitly asserting the violation is
  `CROSS_SCORE_NOT_ALLOWED` and **not** `REMATCH` — proving this is a
  distinct scenario from the rematch test, not a restatement of it.
- **Maximum score difference** — rejected just over the configured
  cap; accepted exactly at the cap (boundary test).
- **Valid participant** (supplementary, beyond the required list) —
  an id absent from the roster (`UNKNOWN_PARTICIPANT`) vs. present but
  inactive (`PARTICIPANT_INACTIVE`), kept as two distinct codes.
- **Valid side/color assignment** (supplementary) — absent
  (not checked), matching (valid), referencing an outside participant,
  and self-assigned to one participant on both sides.
- **Duplicate participant** — the same id in two different pairs, and
  a paired participant also receiving the bye.
- **Invalid bye** — already-byed recipient, inactive recipient, and
  the positive case (eligible recipient accepted).
- **Incomplete pairing** — an active participant omitted entirely
  (with the exact missing id asserted in the diagnostic), a withdrawn
  participant correctly *not* required to appear, the fully-covered
  positive case, and a test proving pair-level and round-level
  violations are aggregated together rather than one masking the
  other.
- **No legal pairing** — the genuine dead-end case (mutual prior
  opponents, both already used their bye, cross-score disabled) is
  `feasible: false` with a populated `reasons` list; a single
  participant with a bye available, an ordinary two-participant case,
  and the empty-roster edge case are all confirmed `feasible: true`.

### Verification performed this phase

Same offline constraint as every prior phase (no network, so Jest
itself cannot run via `npm test`):

- `tsc --noEmit` across the full backend including the new test file:
  zero errors attributable to this phase — exact same baseline error
  count as every previous phase.
- Re-ran the full existing Phase 4A (44) and Phase 4B (32) `tsx`
  verification harnesses after the two additive `HardConstraintType`
  changes: unchanged, confirming zero regression.
- Re-implemented all 25 `validation.test.ts` assertions as a
  plain-Node harness and ran it directly against the real source with
  `tsx`: **25 of 25 passed** on the first run. Combined total across
  this module's full regression + new-feature verification this
  phase: **101 of 101** (44 + 8 + 24 + 25).
- **Not done, and not claimed:** no assertion that this validator is
  wired into any service, route, or the (still nonexistent) optimizer;
  no assertion about matching-feasibility beyond the conservative
  dead-end case described in §5.

## 7. Known limitations / explicitly deferred

- **`assessPairingFeasibility` cannot detect all infeasible inputs**,
  only the total-dead-end case — see §5.
- **Not wired to any service or route.** This is a pure domain-logic
  validation layer, consistent with Phases 4A/4B; integrating it into
  an actual pairing-review workflow (HTTP routes, persistence) is
  future-phase work.
- **No soft-constraint reporting.** By design (§3), this layer never
  reports "this pairing is valid but suboptimal" — that distinction
  belongs entirely to the soft-preference comparator (Phase 4A),
  untouched here.

## 8. Recommended next phase

**Swiss Pairing Optimizer** (unchanged recommendation from Phase 4B,
now more concrete): consume Phase 4B's generated candidate pool,
select a complete matching, and validate the result with this phase's
`validateRoundPairing` before it's ever presented for organizer
review — giving the "Organizer Review" step from the original
architecture a validator it can actually call.
