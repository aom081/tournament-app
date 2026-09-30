-- Phase 3: Tournament lifecycle states + configuration column.
--
-- IMPORTANT: Hand-authored for the same reason as the init migration
-- (prisma/migrations/20260912000000_init_core_domain_model/migration.sql)
-- -- no database or Prisma engine binaries available offline. Verify
-- with `prisma migrate diff` or `prisma migrate dev` in a networked
-- environment before relying on this in a real deployment.

-- New lifecycle states. Existing DRAFT/IN_PROGRESS/COMPLETED/CANCELLED
-- values are untouched; this is purely additive.
ALTER TYPE "TournamentStatus" ADD VALUE 'REGISTRATION';
ALTER TYPE "TournamentStatus" ADD VALUE 'READY';
ALTER TYPE "TournamentStatus" ADD VALUE 'ARCHIVED';

-- Tournament.configuration: added as nullable, backfilled, then made
-- NOT NULL, so this migration is safe to run even against a table
-- that already has rows (a bare "ADD COLUMN ... NOT NULL" with no
-- default would fail on any existing row). The backfilled '{}' is a
-- storage-level placeholder only; the application layer
-- (validateConfiguration) is the source of truth for whether a
-- configuration value is actually valid.
ALTER TABLE "Tournament" ADD COLUMN "configuration" JSONB;
UPDATE "Tournament" SET "configuration" = '{}'::jsonb WHERE "configuration" IS NULL;
ALTER TABLE "Tournament" ALTER COLUMN "configuration" SET NOT NULL;
