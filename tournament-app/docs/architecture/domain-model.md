# Phase 1 — Core Domain Model

Scope: the Prisma schema (`backend/prisma/schema.prisma`) and its
migration only. No services, business logic, auth flows, or
pairing/bracket engines were implemented — see
[`project-analysis.md`](./project-analysis.md) for the full phase plan.

## 1. Entity overview

| Entity | Purpose |
|---|---|
| `User` | An account holder (login credentials, display name). |
| `Role` | A named, generic role (not limited to Organizer/Competitor). |
| `Permission` | A named capability (e.g. `tournament.create`). |
| `RolePermission` | Join table: which Permissions a Role grants. |
| `UserRole` | Global (site-wide) role assignment for a User. |
| `TournamentUserRole` | Tournament-scoped role assignment for a User. |
| `Participant` | A competitor entity. **May or may not** be linked to a `User`. |
| `Tournament` | A tournament: name, `format`, `status`, dates. |
| `TournamentParticipant` | A Participant's registration in one Tournament. |
| `Round` | A numbered round within a Tournament. |
| `Match` | A scheduled contest within a Round, between one or more `TournamentParticipant`s. |
| `MatchParticipant` | Join table: which participants are seated in a Match, and in which slot. |
| `Unit` | A single game/unit of play within a Match ("Game / Unit" in the brief). |
| `Bracket` | One per Tournament; Matches reference it for knockout-stage structure. |
| `TournamentResult` | Aggregated, per-participant result for a Tournament. |
| `Standing` | A ranked, publishable standings snapshot (overall or per-round). |

## 2. Key design decisions

### 2.1 User vs. Participant are structurally separate

`Participant.userId` is **nullable**. A Participant can be created and
compete without ever having a `User` account. If a linked `User` is
deleted, the FK uses `onDelete: SetNull` — the Participant record and
all of its tournament history survive; only the account link is
cleared. This was a deliberate choice over `onDelete: Cascade`, which
would have silently destroyed match history whenever an account was
removed — a Data Integrity violation.

### 2.2 RBAC: two assignment tables instead of one nullable-scope table

The obvious design — a single `UserRole` table with a nullable
`tournamentId` meaning "global if null, scoped if set" — was
considered and rejected. In PostgreSQL, a unique index treats `NULL`
as distinct from every other `NULL`, so `@@unique([userId, roleId,
tournamentId])` would **not** stop a user from being assigned the same
global role twice (two rows with `tournamentId = NULL` count as
non-duplicates to the index). That directly undermines the
"prevent invalid/duplicate assignments" requirement.

Instead, global and tournament-scoped assignments are two explicit
tables:
- `UserRole` — `@@unique([userId, roleId])`, no tournament scope.
- `TournamentUserRole` — `@@unique([userId, roleId, tournamentId])`,
  always tournament-scoped.

Both `Role` and `Permission` are open catalogs (just rows in a table),
so the system is not hard-coded around Organizer/Competitor — any
number of custom roles (Referee, Streamer, Score-keeper, ...) can be
defined and assigned at either scope without schema changes.

### 2.3 Match participants as a join table, not fixed A/B columns

`MatchParticipant(matchId, tournamentParticipantId, slot)` is used
instead of hard-coded `participantAId`/`participantBId` columns on
`Match`. This keeps the schema generic: today every format used is
effectively 1-vs-1, but the schema does not bake that assumption in at
the storage layer. `@@unique([matchId, tournamentParticipantId])`
stops a participant appearing twice in one match; `@@unique([matchId,
slot])` stops two participants double-booking the same slot.

### 2.4 Tournament scope is structural, not just validated

`Match` deliberately has **no** `tournamentId` column. Its tournament
is always reached via `Match → Round → Tournament`. This means "a
match belonging to a different tournament than its round" is not a
state that has to be checked — it's a state that cannot be
represented at all. The same reasoning applies throughout: entities
reference their immediate parent only, never a redundant grandparent
FK, so there is nothing to drift out of sync.

### 2.5 Result hierarchy mapping

The brief's pyramid (`Game/Unit Result → Match Result → Tournament
Result → Standings/Bracket`) is realized as:

- **Game/Unit Result** — fields directly on `Unit` (`status`,
  `winnerTournamentParticipantId`). No separate `UnitResult` table:
  a Unit *is* its own result record once `status = COMPLETED`.
- **Match Result** — fields directly on `Match` (`status`,
  `winnerTournamentParticipantId`), aggregated from its `Unit`s. No
  separate `MatchResult` table, for the same reason.
- **Tournament Result** — `TournamentResult`, one row per
  `TournamentParticipant`, holding the aggregated points/wins/
  losses/draws/rank for that tournament.
- **Standings** — `Standing`, a ranked, timestamped, *publishable*
  snapshot derived from `TournamentResult`. `roundId` is nullable:
  `null` = final/overall standings, set = a per-round snapshot. This
  maps directly onto the Swiss architecture's "Organizer Review →
  Publication" step — publishing standings after a round doesn't
  overwrite the running `TournamentResult`, it creates a new,
  immutable `Standing` snapshot.

`Bracket` is a thin entity: one per Tournament, referenced by `Match`
via `bracketId`. Tree structure is carried on `Match` itself
(`bracketPosition`, and a self-referential `nextMatchId` pointing to
the match the winner advances into). This stores *shape*, not
*generation logic* — building a bracket from a participant list is
pairing-engine work for a later phase.

### 2.6 Naming: "Unit" instead of "Game"

The model is named `Unit` (documented as "Game / Unit" in
product-facing text) to keep the schema itself free of
sport-specific/gameplay-specific connotation, per the domain rule that
the application must not be tied to a specific sport.

## 3. Constraints implemented (per the "Prevent" list)

| Requirement | Mechanism |
|---|---|
| Duplicate tournament registration | `TournamentParticipant @@unique([tournamentId, participantId])` |
| Duplicate game/unit number within a match | `Unit @@unique([matchId, unitNumber])` |
| Duplicate match number within a round | `Match @@unique([roundId, matchNumber])` |
| Participant double-booked in a match | `MatchParticipant @@unique([matchId, tournamentParticipantId])` and `@@unique([matchId, slot])` |
| Duplicate global role assignment | `UserRole @@unique([userId, roleId])` |
| Duplicate tournament-scoped role assignment | `TournamentUserRole @@unique([userId, roleId, tournamentId])` |
| Duplicate round number in a tournament | `Round @@unique([tournamentId, roundNumber])` |
| Duplicate `TournamentResult` row per participant | `TournamentResult.tournamentParticipantId @unique` |
| Duplicate standings row for the same snapshot | `Standing @@unique([tournamentId, roundId, tournamentParticipantId])` |
| Invalid references / orphan records | Every relation is a real FK; there are no free-text/loose identifiers anywhere in the model. |
| Invalid tournament relationships | Structural, not validated — see §2.4. |
| One Bracket per Tournament | `Bracket.tournamentId @unique` |

## 4. Referential integrity / delete policy

Two policies are used consistently across every relation:

- **`Cascade`** — for rows that are wholly owned by their parent and
  have no independent meaning: `RolePermission`, `UserRole`,
  `TournamentUserRole` (pure assignment/join rows), and
  `MatchParticipant` / `Unit` (wholly owned by their `Match`).
- **`Restrict`** — for everything else, to protect historical/result
  data: you cannot delete a `Tournament` while it has `Round`s,
  `TournamentParticipant`s, a `Bracket`, `TournamentResult`s, or
  `Standing`s; you cannot delete a `Round` while it has `Match`es; you
  cannot delete a `TournamentParticipant` while it's referenced by a
  `Match`/`Unit` winner, `MatchParticipant`, `TournamentResult`, or
  `Standing`.
- **`SetNull`** — the one exception, `Participant.userId`, discussed
  in §2.1.

The practical effect: there is currently no way to destructively
delete a tournament (or anything inside it) once it has any real
activity. Deletion of an *empty* `Tournament`, `Round`, etc. is still
possible. Archival/soft-delete workflows for tournaments with history
are left to a future phase (see §7).

## 5. Known limitations

- **Cross-tournament leakage is not FK-enforceable.** Nothing at the
  database level stops a `MatchParticipant` (or `Unit`/`Match` winner,
  or `TournamentResult`/`Standing`) from referencing a
  `TournamentParticipant` that belongs to a *different* tournament
  than the `Match`/`Tournament` it's attached to. PostgreSQL foreign
  keys can't express "these two FK chains must resolve to the same
  Tournament" directly. This must be enforced in the service/
  validation layer in the next phase (e.g. "does this
  TournamentParticipant's tournamentId match this Match's
  Round.tournamentId before allowing the insert").
- **No DB-level CHECK constraints** (e.g. `roundNumber > 0`,
  `unitNumber > 0`, `slot >= 0`). Prisma's native `@@check` support
  could not be verified against the pinned Prisma version without
  network access, so numeric-range validation is left as an
  application-layer concern for the next phase rather than risking an
  unverified schema attribute.
- **No tournament lifecycle/state-machine enforcement.**
  `Tournament.status` is a plain enum column; nothing yet stops an
  illegal transition (e.g. `COMPLETED` → `DRAFT`). That is service-
  layer logic, intentionally deferred.
- **`Unit`/`Match` winner is single-valued.** `winnerTournamentParticipantId`
  supports exactly one winner or `null` (draw/incomplete). Formats
  needing multiple simultaneous winners or ranked (not just win/lose)
  outcomes per unit are not modeled and would need a schema change.
- **Migration was hand-authored, not engine-generated.** The sandbox
  that produced this phase has no network access and no cached Prisma
  engine binaries, so `prisma migrate dev` could not actually run
  against a live database. `prisma/migrations/20260912000000_init_core_domain_model/migration.sql`
  was written by hand to match `schema.prisma` and cross-checked
  line-by-line (see §6), but it has **not** been applied to or
  verified against a real PostgreSQL instance. Before relying on it in
  any real environment: run
  `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
  in a networked environment and diff the result against this file, or
  simply delete this migration folder and run
  `npx prisma migrate dev --name init_core_domain_model` against a
  real database to get an authoritative, engine-generated migration.

## 6. Verification performed this phase

Since no database, Docker, or network access was available:

- Confirmed via `npm ping` that the npm registry is unreachable
  (`403`), and that no Prisma engine binaries or cached CLI exist in
  the sandbox — so `prisma validate`/`migrate dev` genuinely cannot be
  run here.
- Cross-checked the hand-written `migration.sql` against
  `schema.prisma` programmatically: all 16 models have a matching
  `CREATE TABLE`; all 26 relations have a matching `FOREIGN KEY`; the
  `onDelete` action distribution (9 `Cascade` / 16 `Restrict` / 1
  `SetNull`) is identical in both files; all 6 enums have identical
  value lists in both files; all 15 `@@unique`/`@unique` constraints
  have a matching SQL unique index.
- Type-checked the rest of the backend (`tsc --noEmit`) to confirm the
  new schema/tests didn't break the Phase 0 skeleton — no new errors
  beyond the pre-existing "missing node_modules" noise.
- Wrote `backend/tests/domain-schema.test.ts` (a Jest test, not yet
  executable via `npm test` for the same no-network reason) asserting
  the constraints in §3 exist in the schema text. Ran the equivalent
  assertions directly with `tsx` (a globally available runtime in this
  sandbox) against the real schema and migration files: **41 of 41
  assertions passed** (one initial failure was a bug in the assertion
  itself — a regex matching an explanatory code comment rather than an
  actual field — fixed before the final run).
- **Not done, and not claimed:** no assertion that the schema
  successfully applies to a live PostgreSQL database, and no
  assertion that `@prisma/client` generates successfully from it.
  Both require network access this environment does not have.

## 7. Recommended next phase

Per the Phase 0 recommendation, unchanged: a **Service/Validation
layer** that (a) enforces the cross-tournament-consistency invariant
noted in §5, (b) implements authentication, then (c) RBAC enforcement
middleware using the `Role`/`Permission`/`UserRole`/`TournamentUserRole`
tables built in this phase — before any tournament-lifecycle or
pairing-engine work begins.
