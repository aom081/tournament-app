# Tournament Management Web Application

A generic (sport-agnostic) tournament management platform supporting
SWISS, KNOCKOUT, ROUND_ROBIN, and SWISS_TO_KNOCKOUT formats.

## Status

**Phase 0 — Project Initialization.** This repository currently contains
only a minimal, compiling application skeleton (backend health endpoint +
frontend shell). No domain models, authentication, RBAC, or tournament
logic have been implemented yet. See
[`docs/architecture/project-analysis.md`](docs/architecture/project-analysis.md)
for the architecture decisions made so far and the recommended
implementation order for subsequent phases.

## Project structure

```
tournament-app/
├── backend/     Express + TypeScript API (Prisma ORM, PostgreSQL)
├── frontend/    React + TypeScript SPA (Vite)
├── docker-compose.yml   Local PostgreSQL for development
└── docs/architecture/   Architecture decisions and analysis
```

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL) or an existing PostgreSQL instance

## Getting started

### 1. Database

```bash
docker compose up -d postgres
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run dev        # starts on http://localhost:4000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev         # starts on http://localhost:5173
```

The frontend dev server proxies `/api` requests to the backend
(see `frontend/vite.config.ts`).

## Testing

```bash
cd backend
npm test
```

> Note: dependencies have not been installed or executed in the
> environment that generated this scaffold (no network access). Run the
> commands above locally to install and verify.
