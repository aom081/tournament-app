# Phase 3 — Tournament Configuration

Scope: the structured settings a tournament carries (participant
rules, scoring, match format, pairing method, tie-break criteria,
result confirmation), and how they're validated. Defined in
`src/domain/tournament/configuration.ts`.

## 1. Storage: JSON column, not normalized tables

`Tournament.configuration` is a single `Json` (→ `jsonb` in Postgres)
column, not a set of normalized tables — a deliberate choice, not a
shortcut:

- The exact shape of some sub-configs (in particular tie-break rule
  *chains* and pairing-method-specific options) is still open until
  the pairing/tie-break engine phases actually consume them. Committing
  to a relational shape now would mean a schema migration later just
  to accommodate fields nobody has designed yet.
- The application layer (`validateConfiguration`) is the actual source
  of truth for whether a configuration is *valid* — the database only
  guarantees the column is present (`NOT NULL`), not that its contents
  are well-formed. This is why `validateConfiguration` exists and is
  applied on every write path (creation and update), not just as a
  frontend nicety.
- This is flagged as a likely candidate to normalize once the pairing
  engine phase gives the tie-break/pairing sub-configs a concrete,
  stable shape (see `docs/tournament/lifecycle.md` §11 and
  `docs/swiss/domain-model.md` §6).

## 2. Shape

```ts
interface TournamentConfiguration {
  participants: {
    minParticipants: number;       // positive integer
    maxParticipants: number | null; // positive integer, or unlimited
    allowLateRegistration: boolean; // reserved; not yet wired to behavior, see §4
  };
  scoring: {
    winPoints: number;   // >= 0
    drawPoints: number;  // >= 0
    lossPoints: number;  // >= 0
  };
  matchFormat: {
    unitsPerMatch: number;               // positive integer
    winCondition: 'BEST_OF' | 'FIXED_UNITS';
  };
  pairing: {
    method: 'MANUAL' | 'SWISS' | 'ROUND_ROBIN' | 'KNOCKOUT_BRACKET';
    avoidRematches: boolean;
  };
  tieBreak: {
    criteria: Array<'BUCHHOLZ' | 'SONNEBORN_BERGER' | 'HEAD_TO_HEAD' | 'WINS' | 'GAME_WIN_PERCENTAGE'>; // non-empty
  };
  resultConfirmation: {
    requireOpponentConfirmation: boolean;
    requireOrganizerConfirmation: boolean;
    autoConfirmAfterHours: number | null; // positive integer, or never auto-confirm
  };
}
```

Every field maps directly to one of the six categories requested:
Tournament format is the separate `Tournament.format` column (not
duplicated here); the other five categories above are Participant,
Scoring, Match format, Pairing, Tie-break, and Result confirmation
configuration.

## 3. Defaults

`defaultConfiguration(format)` returns a complete, valid configuration
for a newly created tournament, varying only the `pairing.method` by
format:

| Format | Default `pairing.method` |
|---|---|
| `SWISS` | `SWISS` |
| `SWISS_TO_KNOCKOUT` | `SWISS` (initial stage; the knockout stage's own pairing is out of scope here) |
| `KNOCKOUT` | `KNOCKOUT_BRACKET` |
| `ROUND_ROBIN` | `ROUND_ROBIN` |

All other defaults are format-independent: `minParticipants: 2`, no
max, `winPoints: 1` / `drawPoints: 0.5` / `lossPoints: 0`,
`unitsPerMatch: 1` with `FIXED_UNITS`, `avoidRematches: true`,
`tieBreak.criteria: ['WINS']`, and result confirmation requiring the
opponent (not the organizer) to confirm, with a 24-hour auto-confirm
window.

`createTournament` uses `defaultConfiguration(format)` whenever the
caller doesn't supply a `configuration` at all. If a `configuration`
**is** supplied, it must be a complete, valid object — there is no
partial merge with defaults, to keep validation behavior unambiguous
(see §4).

## 4. Validation

`validateConfiguration(input: unknown): TournamentConfiguration` is a
hand-written runtime validator (no new dependency — see rationale
below) that:

- Requires every section (`participants`, `scoring`, `matchFormat`,
  `pairing`, `tieBreak`, `resultConfirmation`) to be present and an
  object. A caller who wants defaults for a section should omit
  `configuration` entirely and get `defaultConfiguration()`, not send
  a partial object expecting the rest to be filled in — this keeps
  "what does an incomplete config mean" unambiguous rather than
  inventing a merge strategy.
- Checks types and ranges per field (positive integers where it makes
  sense, non-negative scoring, enum membership for `winCondition`/
  `pairing.method`/`tieBreak.criteria`, a non-empty `tieBreak.criteria`
  array).
- Cross-checks `minParticipants <= maxParticipants` when a max is set.
- **Collects every problem found and throws one `AppError(400)`**
  listing all of them (semicolon-separated), rather than stopping at
  the first — a caller gets complete feedback in one round trip
  instead of fixing one field at a time.

**No new dependency was added** for this (e.g. zod): the validation
surface is small and stable enough right now that a schema-validation
library would be one more thing to keep in sync with a shape that's
still evolving, for limited benefit over the ~150 lines of
straightforward, fully-tested hand-written checks. This should be
revisited if/when the configuration shape grows significantly (e.g.
once tie-break rule chains get real per-criterion parameters).

## 5. Tests

`tests/tournament/configuration.test.ts`:

- `defaultConfiguration`: correct `pairing.method` per format
  (all four formats checked individually); the produced default
  itself round-trips through `validateConfiguration` unchanged.
- `validateConfiguration`: accepts a fully valid configuration and
  returns it normalized; rejects non-object input (string, `null`,
  number); rejects `minParticipants > maxParticipants`; rejects a
  non-positive `minParticipants`; rejects a negative scoring value;
  rejects an invalid `winCondition`; rejects an invalid pairing
  `method`; rejects an empty `tieBreak.criteria` array; rejects an
  unknown tie-break criterion; accepts `autoConfirmAfterHours: null`;
  and — specifically testing the "collect, don't stop at first" design
  choice — confirms that two unrelated errors (one in `scoring`, one
  in `pairing`) both appear in a single thrown `AppError`'s message.

Verification performed this phase (same offline constraints as
`docs/tournament/lifecycle.md` §"Verification performed this phase")
covers this file together with the lifecycle tests: all 56
lifecycle+configuration assertions were re-implemented and run via
`tsx` against the real source, with zero failures.
