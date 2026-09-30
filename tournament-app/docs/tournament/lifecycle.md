# Phase 3 — Tournament Lifecycle

Scope: the tournament state machine and the operations that move a
tournament through it, built on the Phase 1 schema (extended) and
enforced with the Phase 2 auth/RBAC middleware. No pairing/bracket
generation, no match results — those remain future phases.

## 1. Conflict with the existing schema (resolved)

Phase 1's `TournamentStatus` enum was `DRAFT | IN_PROGRESS | COMPLETED
| CANCELLED`. The requested pipeline — `DRAFT → REGISTRATION → READY →
IN_PROGRESS → COMPLETED → ARCHIVED` — adds three states but doesn't
mention `CANCELLED`. Per working rule #9 (preserve existing
functionality), `CANCELLED` was **kept**, not removed: the enum is now

```
DRAFT | REGISTRATION | READY | IN_PROGRESS | COMPLETED | ARCHIVED | CANCELLED
```

`CANCELLED` is reachable from every pre-completion state and can
itself be archived afterwards (see §2). This was an additive schema
migration (`ALTER TYPE ... ADD VALUE`, cross-checked against the
schema — see §7); no existing enum value was touched.

## 2. The state machine

Defined once, as data, in `src/domain/tournament/lifecycle.ts`:

```
DRAFT         -> REGISTRATION, CANCELLED
REGISTRATION  -> READY, CANCELLED
READY         -> IN_PROGRESS, CANCELLED
IN_PROGRESS   -> COMPLETED, CANCELLED
COMPLETED     -> ARCHIVED
ARCHIVED      -> (terminal)
CANCELLED     -> ARCHIVED
```

Every transition moves strictly forward, or to `CANCELLED`/`ARCHIVED`.
There is no "unlock" transition anywhere (e.g. no `READY →
REGISTRATION`) — that wasn't requested, and adding it would mean
deciding what happens to participants who registered before the
unlock, which is out of scope here.

`canTransition(from, to)` and `assertTransition(from, to)` (which
throws `AppError(409)` naming the actual allowed next states) are the
single source of truth; every service method that changes status
calls `assertTransition` rather than checking status inline, so the
rule is enforced identically everywhere.

## 3. Operation → transition mapping

| Requested operation | Maps to |
|---|---|
| Create tournament | Creates in `DRAFT` |
| Update tournament | No transition; allowed only while `DRAFT` or `REGISTRATION` (see §4) |
| Register participant | No transition; requires `REGISTRATION` |
| Remove participant | No transition; requires `REGISTRATION` |
| Lock registration | `REGISTRATION → READY` (gated by readiness, §5) |
| Validate tournament readiness | Read-only check, reused by "Lock registration" (§5) |
| Start tournament | `READY → IN_PROGRESS` |
| Create rounds | No transition; requires `IN_PROGRESS` (see §6) |
| Complete tournament | `IN_PROGRESS → COMPLETED` |
| Archive tournament | `COMPLETED → ARCHIVED` or `CANCELLED → ARCHIVED` |

**One operation was added that wasn't explicitly named:**
`openRegistration` (`DRAFT → REGISTRATION`). The requested operation
list has no "open registration" entry, but without it the six-state
pipeline has no way to ever leave `DRAFT` — this is added under
working rule #6's carve-out ("unless strictly required ... for
correctness"), not as an extra feature.

`cancelTournament` (`→ CANCELLED`) was also added, purely to preserve
the pre-existing `CANCELLED` state's reachability (§1) — not a new
capability, a preserved one.

## 4. Update rules

- Allowed only while `status` is `DRAFT` or `REGISTRATION`.
- `format` is **not** part of `UpdateTournamentInput` at all — it's
  immutable after creation. Changing the format after participants
  may have registered (or after configuration decisions were made
  around it) is a correctness risk with no clear semantics for
  existing data, so it isn't offered rather than being partially
  supported.
- `name`, `startDate`, `endDate`, `configuration` may all be updated
  in `DRAFT`/`REGISTRATION`. Configuration updates go through the same
  `validateConfiguration` as creation (see
  `docs/tournament/configuration.md`).

## 5. Readiness and locking

`assessReadiness({ registeredParticipantCount, configuration })` is a
pure function returning `{ isReady, issues[] }`:

- `registeredParticipantCount < configuration.participants.minParticipants` → issue.
- `maxParticipants` set and count exceeds it → issue (defensive check;
  registration itself already refuses to exceed the max, see §6, so
  this should never actually fire in practice, but it's checked
  independently rather than assumed).

`getReadiness(tournamentId)` exposes this as a **read-only** operation
(counts current `REGISTERED` participants, calls `assessReadiness`) —
usable at any time to answer "are we ready yet?" without changing
anything. `lockRegistration` calls the same function internally and
**does not mutate status if not ready** — the transition simply throws
`AppError(409)` with the specific issues, verified explicitly in
`tests/tournament/tournament.service.test.ts` ("status unchanged after
failed lock").

## 6. Registration rules

- `registerParticipant`: requires `status === 'REGISTRATION'` exactly.
  Verifies the `Participant` exists, rejects a duplicate registration
  for the same tournament+participant pair, and enforces
  `configuration.participants.maxParticipants` when set.
- `removeParticipant`: requires `status === 'REGISTRATION'` exactly.
  **Soft removal only** — sets `TournamentParticipant.status =
  'WITHDRAWN'` (the enum already had this value from Phase 1); the row
  is never deleted, preserving referential integrity and history.
  Rejects removing an already-withdrawn/disqualified participant, and
  rejects a `tournamentParticipantId` that belongs to a different
  tournament.

## 7. Rounds

`createRound` requires `status === 'IN_PROGRESS'` and creates the next
sequential `Round` (`max(existing roundNumber) + 1`). **Deliberately
does not** check whether the previous round is "finished" before
allowing the next one — Round *completion* tracking doesn't exist yet
(no code anywhere sets a `Round.status` to `COMPLETED`), and requiring
it here would make multi-round tournaments unreachable within this
phase's own scope. The Phase 1 database constraint
`@@unique([roundId, matchNumber])`... actually the relevant one here,
`@@unique([tournamentId, roundNumber])` on `Round`, remains the
ultimate backstop against a duplicate round number regardless. See §9
for what's deferred here.

## 8. Completion and archiving

- `completeTournament`: `IN_PROGRESS → COMPLETED`. This is a **pure
  state transition** in this phase — it does not check that all
  rounds/matches are finished, because nothing yet tracks round/match
  completion (§7). Gating tournament completion on match-result state
  is a natural fit for the upcoming match-result/scoring phase, not
  this one.
- `archiveTournament`: `COMPLETED → ARCHIVED` or `CANCELLED →
  ARCHIVED`. Rejects archiving from any other state (e.g. an active
  tournament) and rejects double-archiving.

## 9. Known limitations / explicitly deferred

- **No round/match completion tracking**, so neither "create the next
  round" nor "complete the tournament" is gated on prior rounds
  actually finishing. This is the most significant scope boundary in
  this phase — see §7–8.
- **`configuration.participants.allowLateRegistration` is not wired
  to any behavior.** It's part of the validated configuration schema
  (per the "Participant configuration" requirement) but
  `registerParticipant` always requires `status === 'REGISTRATION'`
  regardless of this flag's value. Wiring it up (e.g. permitting
  registration during `IN_PROGRESS` with this flag set) is deferred
  until there's a concrete late-registration workflow to design
  around (how does a late entrant's score/pairing history work?).
- **No reopening a locked/started tournament.** Not requested; would
  need its own design for what happens to already-created
  rounds/registrations.
- **Cross-tournament consistency gap noted in
  `docs/architecture/domain-model.md` §5 is still open**: nothing at
  the database level stops a `TournamentParticipant` reference from
  crossing tournament boundaries. `removeParticipant` explicitly
  checks `tournamentParticipant.tournamentId === tournamentId` at the
  service layer as a partial mitigation (tested), but this is
  per-operation vigilance, not a structural guarantee.
- **Migration is hand-authored**, same caveat as every schema change
  so far in this project: no live database or Prisma engine available
  offline to generate/apply it for real. Cross-checked programmatically
  against the schema (§ Verification below) but not run against
  PostgreSQL.

## 10. Tests

- **`tests/tournament/lifecycle.test.ts`** — every valid transition in
  the table (parameterized), every invalid transition tested
  explicitly (including "no self-transitions" for any state), the
  409 error naming allowed next states, the terminal-state message,
  and `assessReadiness` at/below/above the configured min and max.
- **`tests/tournament/configuration.test.ts`** — see
  `docs/tournament/configuration.md` §5.
- **`tests/tournament/tournament.service.test.ts`** — the full
  operation set against an in-memory fake Prisma client: creation
  (defaults, empty-name rejection, invalid-config rejection), update
  (allowed states, immutability elsewhere, 404), registration rules
  (open/duplicate/unknown-participant/max-count), removal (soft
  withdraw, locked-state rejection, double-removal, cross-tournament
  rejection), readiness/locking (not-ready 409 with unchanged status,
  success at exactly the minimum), start conditions, round creation
  (sequential numbering, pre-start rejection), completion, and
  archiving (from both `COMPLETED` and `CANCELLED`, rejection from
  active/already-archived states), and cancellation from every
  eligible state plus rejection from `COMPLETED`.

### Verification performed this phase

Same offline constraint as every prior phase (no network, so `npm
test` itself could not run):

- `tsc --noEmit` across the full backend, including all three new test
  files (via a temporary tsconfig including `tests/`): zero errors
  beyond the same pre-existing "missing node_modules" and
  missing-`@types` noise from before this phase touched anything.
- Executed the equivalent of all three test files' assertions (95
  total: 56 for lifecycle+configuration, 39 for the service layer) as
  a plain-Node harness against the real source files with `tsx` —
  **95 of 95 passed**.
- **A real bug was caught during this verification, in a test helper,
  not the implementation**: the "enforces the configured maximum
  participant count" test built a tournament configuration with
  `maxParticipants: 1` while leaving `minParticipants` at its default
  of `2` — an internally inconsistent configuration that
  `validateConfiguration` correctly rejected, which masked the actual
  scenario the test meant to exercise. Fixed by setting
  `minParticipants: 1` for that scenario, in both the committed Jest
  test file and the verification harness, before re-confirming all
  95 assertions passed.
- Cross-checked the new migration
  (`20260913000000_tournament_lifecycle_and_configuration`)
  programmatically against `schema.prisma`: exactly 3 new enum values
  added (`REGISTRATION`, `READY`, `ARCHIVED`), matching the 4
  pre-existing + 3 new = 7 total values in the schema's
  `TournamentStatus` enum.
- **Not done, and not claimed:** no assertion that the migration
  applies to a live PostgreSQL database, and no HTTP-level
  (`supertest`) test of `tournament.route.ts` — both require the
  actual npm packages and a live database, unavailable here.

## 11. Recommended next phase

Round/Match completion and result recording — this is the natural
next step that resolves the deferred items in §7–8 (what makes a round
"done", what gates tournament completion) and connects the tournament
lifecycle to the Phase 1 result hierarchy
(`Unit → Match → TournamentResult → Standing`) and the Phase 4A Swiss
domain model (which still has no persisted `PairingRun` and no actual
pairing algorithm).
