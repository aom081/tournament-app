import { AppError } from '../../middleware/error-handler';

import { TournamentConfiguration } from './configuration';

// Local mirror of the Prisma TournamentStatus enum -- kept as a plain
// string union (rather than importing @prisma/client) for the same
// reason as TournamentFormat in configuration.ts: zero dependency on
// the generated client, testable without a database. Must be kept in
// sync with prisma/schema.prisma's `enum TournamentStatus`.
export type TournamentStatus = 'DRAFT' | 'REGISTRATION' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'ARCHIVED' | 'CANCELLED';

/**
 * The full lifecycle state machine.
 *
 * The requested pipeline is DRAFT -> REGISTRATION -> READY ->
 * IN_PROGRESS -> COMPLETED -> ARCHIVED. CANCELLED is additionally kept
 * (it existed in the schema before this phase and real tournaments do
 * get cancelled) as an off-ramp from every state prior to completion,
 * and can itself be archived afterwards -- see
 * docs/tournament/lifecycle.md for the full rationale.
 *
 * There is no transition back to an earlier state anywhere in this
 * table (e.g. no READY -> REGISTRATION "unlock"): every transition
 * moves strictly forward or to CANCELLED/ARCHIVED. Reopening a locked
 * or started tournament was not requested and is left as a future
 * decision if a real need for it emerges.
 */
const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ['REGISTRATION', 'CANCELLED'],
  REGISTRATION: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: ['ARCHIVED'],
};

export function canTransition(from: TournamentStatus, to: TournamentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function getAllowedTransitions(from: TournamentStatus): TournamentStatus[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** Throws AppError(409) if the transition is not allowed; otherwise
 * returns normally. Centralizes the "invalid state transition" error
 * shape so every service method reports it identically. */
export function assertTransition(from: TournamentStatus, to: TournamentStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      `Cannot transition tournament from ${from} to ${to}. Allowed next states: ${getAllowedTransitions(from).join(', ') || '(none - terminal state)'}.`,
      409,
    );
  }
}

export interface ReadinessResult {
  isReady: boolean;
  issues: string[];
}

/**
 * Checks whether a tournament has enough (and not too many)
 * registered participants to proceed, per its own configuration. Pure
 * function -- takes the counts/config it needs as plain values so it
 * can be unit-tested without a database, and reused identically by
 * both "check readiness" (read-only) and "lock registration"
 * (mutating) operations.
 */
export function assessReadiness(params: {
  registeredParticipantCount: number;
  configuration: TournamentConfiguration;
}): ReadinessResult {
  const issues: string[] = [];
  const { minParticipants, maxParticipants } = params.configuration.participants;

  if (params.registeredParticipantCount < minParticipants) {
    issues.push(
      `At least ${minParticipants} registered participants are required (currently ${params.registeredParticipantCount}).`,
    );
  }

  if (maxParticipants !== null && params.registeredParticipantCount > maxParticipants) {
    issues.push(
      `Registered participant count (${params.registeredParticipantCount}) exceeds the configured maximum (${maxParticipants}).`,
    );
  }

  return { isReady: issues.length === 0, issues };
}
