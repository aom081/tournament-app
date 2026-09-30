# Phase 2 — Authentication & Flexible RBAC

Scope: authentication (login/registration, JWT issuance) and
authorization (permission-based access control) as a service +
middleware layer on top of the Phase 1 schema (`User`, `Role`,
`Permission`, `RolePermission`, `UserRole`, `TournamentUserRole`). No
tournament features, no new schema.

## 1. Authentication

- **Mechanism:** email + password, verified with `bcryptjs`
  (`src/lib/password.ts`), issuing a signed JWT (`jsonwebtoken`,
  `src/lib/jwt.ts`) containing `{ sub: userId, email }`.
- **Routes** (`src/routes/auth.route.ts`, mounted at `/api/v1`):
  - `POST /auth/register` — `{ email, password, displayName }` →
    creates a `User` with **zero** role assignments. A new account has
    no permissions until an administrator grants a role; registration
    alone confers no access.
  - `POST /auth/login` — `{ email, password }` → `{ token, user }`.
  - `GET /auth/me` — requires a valid token; returns the caller's
    identity and their current **global** effective permissions.
- **Error handling:** unknown email and wrong password both return the
  identical `401 Invalid email or password`, to avoid leaking which
  emails are registered (tested — see §5).
- **Secret handling:** `JWT_SECRET` has a development fallback but the
  app **refuses to boot** if `NODE_ENV=production` and `JWT_SECRET` is
  not set explicitly (`src/config/env.ts`).

## 2. Authorization model — not hard-coded to Organizer/Competitor

The schema (unchanged from Phase 1) already models this generically:

- `Role` and `Permission` are just rows in tables — any number of
  roles, with any names, can be created.
- `RolePermission` — many-to-many: a `Role` grants zero or more
  `Permission`s.
- `UserRole` — a **global** role assignment for a `User`.
- `TournamentUserRole` — a **tournament-scoped** role assignment for a
  `User` (same user can hold different roles in different
  tournaments).

The authorization service (`src/services/authorization.service.ts`)
only ever asks "does this user's set of assigned roles grant this
permission key, at this scope?" — it has **no branch anywhere that
checks a role's name**. `Organizer` and `Competitor` exist only as
**example seed data** (`prisma/seed.ts`); deleting them, renaming them,
or adding a `Referee`/`Streamer`/`ScoreKeeper` role requires zero code
changes.

### Permission catalog

Seeded in `prisma/seed.ts`, exactly as specified:

`TOURNAMENT_CREATE`, `TOURNAMENT_MANAGE`, `TOURNAMENT_VIEW`,
`PAIRING_GENERATE`, `PAIRING_REVIEW`, `PAIRING_APPROVE`,
`PAIRING_PUBLISH`, `GAME_RESULT_SUBMIT`, `MATCH_RESULT_SUBMIT`,
`MATCH_RESULT_CONFIRM`, `MATCH_RESULT_CORRECT`, `MATCH_RESULT_DISPUTE`,
`STANDINGS_VIEW`, `AUDIT_VIEW`.

These are the only two roles seeded by default (illustrative, not
privileged in code):

| Role | Permissions |
|---|---|
| `Organizer` | `TOURNAMENT_CREATE`, `TOURNAMENT_MANAGE`, `TOURNAMENT_VIEW`, `PAIRING_GENERATE`, `PAIRING_REVIEW`, `PAIRING_APPROVE`, `PAIRING_PUBLISH`, `MATCH_RESULT_CONFIRM`, `MATCH_RESULT_CORRECT`, `STANDINGS_VIEW`, `AUDIT_VIEW` |
| `Competitor` | `TOURNAMENT_VIEW`, `GAME_RESULT_SUBMIT`, `MATCH_RESULT_SUBMIT`, `MATCH_RESULT_DISPUTE`, `STANDINGS_VIEW` |

### Permission resolution rule

For a check with no tournament context: **global roles only**.
For a check scoped to a specific tournament: **global roles ∪ that
tournament's roles**. A tournament-scoped role in Tournament A grants
nothing in Tournament B — verified explicitly in tests (§5).

## 3. Server-side enforcement

Two Express middlewares, applied in order:

1. **`authenticate`** (`src/middleware/authenticate.ts`) — reads
   `Authorization: Bearer <token>`, verifies it, and sets
   `req.user = { id, email }`. Missing header, malformed header, or an
   invalid/expired token all yield `401` before any handler runs.
2. **`requirePermission(key, { tournamentIdParam? })`**
   (`src/middleware/authorize.ts`) — must run after `authenticate`.
   Looks up the caller's effective permissions (scoped to
   `req.params[tournamentIdParam]` if configured) and yields `403` if
   the required key is absent.

Usage pattern for a future protected route (illustrative — no such
route is added in this phase):

```ts
router.post(
  '/tournaments/:tournamentId/pairings/generate',
  authenticate,
  requirePermission('PAIRING_GENERATE', { tournamentIdParam: 'tournamentId' }),
  handler,
);
```

Because the check happens in middleware before the handler runs, there
is no code path that reaches a protected handler without passing
authentication and authorization — enforcement cannot be bypassed by
a client, only by a bug in how a route is wired.

## 4. Architecture: pure logic vs. concrete adapters

Every piece of authorization/authentication logic is split into two
layers:

- **Pure factories** — `createAuthorizationService(client)`,
  `createAuthService(deps)`, `createAuthenticateMiddleware(verify)`,
  `createRequirePermission(hasPermission)`. Each takes its
  dependencies (a Prisma-shaped client, a hash function, a token
  verifier, ...) as **parameters**, typed against a small local
  interface — never importing `@prisma/client`, `bcryptjs`, or
  `jsonwebtoken` directly.
- **Instances** — `src/lib/{prisma,password,jwt}.ts` (concrete
  adapters) and `src/services/*.instance.ts` /
  `src/middleware/auth.instance.ts` (wiring), which call the factories
  with the real dependencies for the running application.

This is not incidental — it's why every piece of this phase's logic
could be tested in this sandbox at all (see §6): the pure factories
have zero dependency on packages that require a database connection or
network-installed libraries, so their control-flow, edge cases, and
security-relevant behavior (e.g. identical error for wrong-password vs.
unknown-email) can be verified directly.

## 5. Tests

Four Jest test files, all exercising the pure factories with
hand-written fakes (no real database, no real bcryptjs/jsonwebtoken):

- **`tests/authorization.service.test.ts`** — permission mapping:
  global role grants everywhere; tournament-scoped role grants only in
  that tournament and nowhere else; union of global + scoped; custom
  role names work with no special-casing; user with no roles has no
  permissions; duplicate role assignment is idempotent.
- **`tests/auth.service.test.ts`** — registration (returns a safe
  user object, rejects duplicate email with `409`); login (issues a
  token on success, `401` for unknown email, `401` for wrong password,
  and — explicitly — that both failure cases produce the *identical*
  error, preventing user enumeration).
- **`tests/authenticate.middleware.test.ts`** — missing header,
  non-Bearer header, and failed verification each yield `401`; a valid
  token populates `req.user` and calls `next()` cleanly.
- **`tests/authorize.middleware.test.ts`** — missing `req.user` yields
  `401`; denied permission yields `403`; allowed permission calls
  `next()`; `tournamentIdParam` correctly extracts the scope from
  route params; an unexpected error from the permission checker is
  forwarded to `next(err)` rather than swallowed.

## 6. Verification performed this phase

Same constraint as Phases 0–1: this sandbox has no network access, so
`npm install` — and therefore a real `npm test` run of the four Jest
files above — could not be executed.

What **was** done:

- `tsc --noEmit` across all new/changed source: zero errors beyond the
  expected "module not found" noise for uninstalled packages
  (`express`, `jsonwebtoken`, `bcryptjs`, `@prisma/client`). One real
  bug was caught and fixed this way (implicit `any` on `next`
  parameters in `auth.route.ts`).
- `tsc --noEmit` against the test files too (temporary tsconfig
  including `tests/`): zero errors beyond missing `@types/jest`/
  `@types/node` type-definition files.
- Confirmed via `tsx` that every pure factory module
  (`authorization.service.ts`, `auth.service.ts`, `authenticate.ts`,
  `authorize.ts`) loads and runs with **zero** of the four uninstalled
  packages present, because they only ever import those packages'
  *types*, never their values.
- Re-implemented all 26 individual assertions from the four Jest test
  files as a plain-Node harness (no Jest runtime, no mocking
  framework — hand-rolled fakes and `console`-based assertions) and
  ran it directly against the real source files with `tsx`: **26 of
  26 passed**.
- **Not done, and not claimed:** the real bcryptjs hashing, real
  jsonwebtoken signing/verification, the real Prisma-backed
  authorization queries, and the HTTP routes end-to-end (`supertest`
  against `createApp()`) were **not** executed, because doing so
  requires the actual npm packages and a live database, neither of
  which is available here. These must be verified with `npm install &&
  npm test` in a networked environment before this phase is considered
  production-verified.

## 7. Known limitations / explicitly out of scope

- **No admin API for managing role assignments.**
  `assignGlobalRole`/`assignTournamentRole` exist and are tested at
  the service layer, and are used by `prisma/seed.ts`, but there is no
  HTTP route to grant/revoke a role in this phase. Exposing that is an
  admin-tooling concern for a later phase, not "authentication +
  RBAC enforcement" itself.
- **No password reset / email verification / account lockout.**
  Registration and login are intentionally minimal; these are
  security-hardening features for a dedicated later phase.
- **The cross-tournament-consistency gap noted in
  `docs/architecture/domain-model.md` §5 is still open.** RBAC scoping
  is correct (a `TournamentUserRole` only grants access within its own
  `tournamentId`), but nothing yet stops a route handler from being
  wired to check the wrong tournament's scope, or a
  `TournamentParticipant`/`Match` combination from referencing
  mismatched tournaments. That remains a service/validation-layer
  concern for the tournament-lifecycle phase.
- **No refresh tokens / logout / revocation.** A JWT issued by `login`
  is valid until it expires (`JWT_EXPIRES_IN`, default `1h`); there is
  no server-side session store to revoke it early. Acceptable for this
  phase's scope; a future phase should decide whether revocation is
  needed.

## 8. Recommended next phase

Tournament lifecycle (creation, state transitions) is now safe to
build: routes can be wrapped with `authenticate` +
`requirePermission('TOURNAMENT_CREATE'|'TOURNAMENT_MANAGE', ...)`
immediately, using the mechanism built in this phase, without any
further authorization work.
