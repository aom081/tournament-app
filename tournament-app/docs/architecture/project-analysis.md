# Phase 0 — Project Initialization & Architecture Decisions

> **Note on scope deviation:** The originally requested Phase 0 was a
> *project analysis* of an existing codebase. No codebase existed
> (confirmed: no repository, no uploaded files, no prior session
> artifacts). This document therefore records **initialization
> decisions** instead of **analysis findings**. Every section below
> maps to the requested outline, but content reflects a greenfield
> state rather than discovery of pre-existing code.

## 1. Current architecture

A minimal two-tier application skeleton has been created:

- **Backend:** Node.js + Express + TypeScript, using an "app factory"
  pattern (`createApp()` in `src/app.ts`) separated from the process
  bootstrap (`src/index.ts`). This allows the Express app to be
  imported directly into tests (via `supertest`) without binding a
  network port.
- **Frontend:** React + TypeScript, built with Vite. Dev server proxies
  `/api/*` to the backend (`frontend/vite.config.ts`), avoiding CORS
  friction in local development while `CORS_ORIGIN` is still enforced
  server-side for non-proxied clients.
- **Database:** PostgreSQL, accessed through Prisma ORM. The schema
  currently defines only `datasource`/`generator` blocks — **no domain
  models exist yet**.
- **Local infra:** `docker-compose.yml` provisions a PostgreSQL 16
  container for local development.

No API versioning scheme is enforced beyond a `/api/v1` mount prefix
established on the single existing route (`/api/v1/health`), so future
routers have a convention to follow.

## 2. Existing modules

| Module | Status |
|---|---|
| Health check (`/api/v1/health`) | Implemented |
| Error handling middleware (`AppError`, `notFoundHandler`, `errorHandler`) | Implemented — generic, not tied to any domain |
| Environment config loader (`src/config/env.ts`) | Implemented |
| Users / Participants | **Not implemented** |
| Authentication | **Not implemented** |
| RBAC | **Not implemented** |
| Tournament lifecycle | **Not implemented** |
| Swiss pairing engine | **Not implemented** |
| Knockout bracket | **Not implemented** |
| Round robin | **Not implemented** |
| Match / Game results | **Not implemented** |
| Standings | **Not implemented** |

## 3. Existing database / domain model

None. `prisma/schema.prisma` contains only the PostgreSQL datasource
and client generator. No tables, enums, or relations exist. This is a
deliberate Phase 0 boundary: domain modeling for Users/Participants,
Tournaments, Matches, Games, Results, and RBAC entities is
architecturally significant enough (per the RESULT ARCHITECTURE and
Swiss architecture pyramids given in the brief) to warrant its own
dedicated phase rather than being decided incidentally while
scaffolding tooling.

## 4. Existing authentication / RBAC

None implemented. No auth middleware, no session/JWT handling, no role
or permission model exists yet. This is flagged as a **prerequisite
architectural decision** for the next phase (see Section 11) because:

- The domain rule "RBAC must remain flexible; do not hard-code around
  only Organizer/Competitor" implies a permission-based or
  role-assignment-table design (not an enum-only role field on `User`).
- Authentication (who is this request from) and authorization (what
  can they do, and in what scope — e.g. per-tournament role) are
  distinct concerns and should be modeled as such from the start to
  avoid rework.

## 5. Existing tournament functionality

None. No tournament entity, no format-specific logic (SWISS,
KNOCKOUT, ROUND_ROBIN, SWISS_TO_KNOCKOUT), no lifecycle/state machine.

## 6. Existing result architecture

None. The layered pipeline described in the brief (Game/Unit Result →
Match Result → Tournament Result → Standings/Bracket) has no code yet.
No aggregation logic, no standings computation, no bracket advancement.

## 7. Existing tests

One test file: `backend/tests/health.test.ts`, covering:
- `GET /api/v1/health` returns `200` with an `ok` status payload.
- An unmatched route returns `404` with a structured error body.

No frontend tests exist yet (no test runner configured for the
frontend in this phase — adding one was judged out of scope for a
skeleton whose only component has no meaningful logic to test).

## 8. Reusable components

These conventions are established now so future phases build on them
instead of reinventing:

- **App factory pattern** (`createApp`) — future domain routers should
  be added via `app.use('/api/v1', someRouter)` in `src/app.ts`.
- **Centralized error handling** (`AppError`, `errorHandler`,
  `notFoundHandler`) — future domain errors should throw/extend
  `AppError` with an explicit HTTP status rather than handling errors
  ad hoc per-route.
- **Environment config module** (`src/config/env.ts`) — future
  required env vars should be added here via the `required()` helper
  rather than reading `process.env` directly in business logic.
- **Route-per-file + `*.route.ts` naming** — established by
  `health.route.ts`.

## 9. Duplicates

None — greenfield project, single implementation of every concern.

## 10. Risks

- **No domain model yet:** every downstream phase (auth, tournaments,
  results) depends on schema decisions not yet made. Getting the
  core entities (User, Participant, Tournament, Match, Game/Unit
  Result) and their relationships right early is high-leverage; a
  wrong shape here is expensive to unwind later given the
  Correctness > Data Integrity priority ordering in the brief.
- **RBAC flexibility is easy to violate accidentally.** A naive
  `role: 'ORGANIZER' | 'COMPETITOR'` enum on `User` would directly
  contradict the stated domain rule. This needs explicit design
  attention in the next phase, not an incidental default.
- **Swiss pairing determinism** is an explicit architectural concern
  in the brief (Tournament State → Swiss Pairing Input → Engine →
  Validation → Organizer Review → Publication). This pipeline has
  stateful, order-sensitive steps; it should be designed as pure/
  deterministic functions operating on explicit inputs, with
  side effects (persistence, publication) kept at the edges.
- **Dependencies are unverified in a real install.** This sandbox has
  no network access, so `npm install` was never run. Version numbers
  in `package.json` are believed compatible (Express 4.x, Prisma 5.x,
  Vite 5.x, React 18.x — all mutually compatible LTS-era releases as
  of this writing) but have not been installed or executed end-to-end.
  **This must be verified in an environment with network access before
  relying on this scaffold.**
- **No CI/deployment configuration yet.** Acceptable for Phase 0;
  flagged so it isn't forgotten.

## 11. Recommended implementation order

Given the stated architecture pyramids and domain rules, in priority
order:

1. **Domain modeling phase** — define Prisma schema for User,
   Participant (as a distinct concept from User, per domain rules),
   Tournament (with `format` enum: SWISS / KNOCKOUT / ROUND_ROBIN /
   SWISS_TO_KNOCKOUT), Match, Game/Unit Result, and the RBAC entities
   (e.g. `Role`, `Permission`, and a scoped assignment table such as
   `TournamentMembership` rather than a single global role field).
   This is the foundation everything else builds on.
2. **Authentication** — login/session or token issuance, independent
   of authorization logic.
3. **Authorization / RBAC enforcement** — middleware that checks
   permissions against the scoped role-assignment model from step 1.
4. **Tournament lifecycle** — creation, state transitions
   (draft → active → completed, etc.), format selection.
5. **Result architecture, bottom-up** — Game/Unit Result recording
   first, then Match Result aggregation, then Tournament Result,
   matching the pyramid in the brief exactly (build the base before
   the layers that depend on it).
6. **Format-specific engines** — Round Robin and Knockout first (they
   are comparatively simpler/more deterministic), then Swiss pairing
   (Tournament State → Pairing Input → Engine → Validation → Organizer
   Review → Publication), then SWISS_TO_KNOCKOUT as a composition of
   the two.
7. **Standings / bracket presentation** — derived read-models built on
   top of the finalized result architecture, not a parallel source of
   truth.
8. **Frontend feature UI**, once backend contracts for each of the
   above stabilize.

Each of these should be treated as its own phase per the working
rules (implement only what's requested, stop after each phase).
