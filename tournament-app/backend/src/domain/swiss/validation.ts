// Phase 4C: hard constraint validation layer.
//
// Conceptual flow this module implements:
//   Candidate -> Hard Constraint Validator -> Valid/Invalid -> Diagnostics
//
// Two levels are validated, matching the fact that some listed hard
// constraints are about a single pair (self-pair, valid participant,
// legal opponent, valid side assignment) while others only make sense
// about a WHOLE round's proposed pairing (no participant appears
// twice, valid bye, complete legal pairing). See
// docs/swiss/hard-constraint-validation.md for the full rationale and
// the mapping from each named requirement to its diagnostic code.
//
// This module validates PROPOSED pairings; it does not propose or
// choose them. It reuses Phase 4A's per-pair checks
// (checkHardConstraints, checkByeAssignment) and Phase 4B's
// generateCandidates (only for the feasibility check) rather than
// reimplementing that logic.

import { checkByeAssignment, isEligibleForBye } from './bye';
import { generateCandidates } from './candidates';
import { checkHardConstraints, computeScoreDifference } from './constraints';
import {
  ByeAssignment,
  CrossScorePolicy,
  HardConstraintViolation,
  ParticipantPairingProfile,
  SideAssignment,
  SwissPairingInput,
} from './types';

// ---------------------------------------------------------------------------
// Pair-level validation
// ---------------------------------------------------------------------------

export interface PairValidationContext {
  participants: ParticipantPairingProfile[];
  crossScorePolicy: CrossScorePolicy;
  allowRematches: boolean;
}

export interface ProposedPair {
  participantAId: string;
  participantBId: string;
  /** Present only when a side/color has actually been assigned to
   * this pair; validated only "where absolute" -- i.e., only when
   * present at all (see validatePair). */
  sideAssignment?: SideAssignment;
}

export interface ValidationResult {
  valid: boolean;
  violations: HardConstraintViolation[];
}

function findParticipant(id: string, participants: ParticipantPairingProfile[]): ParticipantPairingProfile | undefined {
  return participants.find((p) => p.tournamentParticipantId === id);
}

/**
 * Validates a single proposed pair against every pair-scoped hard
 * constraint: no self-pair, valid participant (both ids resolve to a
 * real, active participant), legal opponent (no prohibited rematch,
 * within the configured maximum score difference, cross-score
 * pairing permitted if the pair crosses score groups), and -- when a
 * side assignment is actually present on the candidate -- that it is
 * a valid assignment for exactly these two participants.
 *
 * Short-circuits at the first failing CATEGORY (self-pair, then
 * participant validity) because later checks are meaningless without
 * two resolved, distinct, active participants to check them against;
 * diagnostics still always name the specific rule that failed.
 */
export function validatePair(
  participantAId: string,
  participantBId: string,
  sideAssignment: SideAssignment | undefined,
  context: PairValidationContext,
): ValidationResult {
  if (participantAId === participantBId) {
    return {
      valid: false,
      violations: [
        {
          type: 'SELF_PAIRING',
          message: 'A participant cannot be paired against themselves.',
          participantIds: [participantAId],
        },
      ],
    };
  }

  const participantA = findParticipant(participantAId, context.participants);
  const participantB = findParticipant(participantBId, context.participants);

  const participantValidityViolations: HardConstraintViolation[] = [];
  for (const [id, participant] of [
    [participantAId, participantA],
    [participantBId, participantB],
  ] as const) {
    if (!participant) {
      participantValidityViolations.push({
        type: 'UNKNOWN_PARTICIPANT',
        message: `No participant with id ${id} exists in this pairing input.`,
        participantIds: [id],
      });
    } else if (!participant.active) {
      participantValidityViolations.push({
        type: 'PARTICIPANT_INACTIVE',
        message: `Participant ${id} is inactive (withdrawn/disqualified) and cannot be paired.`,
        participantIds: [id],
      });
    }
  }

  if (participantValidityViolations.length > 0 || !participantA || !participantB) {
    // Cannot meaningfully evaluate "legal opponent" or side-assignment
    // rules against a participant that doesn't validly exist.
    return { valid: false, violations: participantValidityViolations };
  }

  const sameScoreGroup = participantA.score === participantB.score;
  const legalOpponentViolations = checkHardConstraints(
    participantA,
    participantB,
    sameScoreGroup,
    context.crossScorePolicy,
    context.allowRematches,
  );

  const sideAssignmentViolations = validateSideAssignment(participantAId, participantBId, sideAssignment);

  const violations = [...legalOpponentViolations, ...sideAssignmentViolations];
  return { valid: violations.length === 0, violations };
}

/**
 * Side/color assignment is only ever checked "where absolute" -- i.e.
 * only when a sideAssignment is actually attached to the candidate at
 * all. A candidate with no side assignment (e.g. a format with no
 * side/color concept) is not a violation of this rule; the rule only
 * fires when a side assignment is present and internally inconsistent
 * with the pair it's supposedly for.
 */
function validateSideAssignment(
  participantAId: string,
  participantBId: string,
  sideAssignment: SideAssignment | undefined,
): HardConstraintViolation[] {
  if (!sideAssignment) {
    return [];
  }

  const expected = new Set([participantAId, participantBId]);
  const actual = new Set([sideAssignment.sideAParticipantId, sideAssignment.sideBParticipantId]);
  const sameSet = expected.size === actual.size && [...expected].every((id) => actual.has(id));
  const noSelfAssignment = sideAssignment.sideAParticipantId !== sideAssignment.sideBParticipantId;

  if (sameSet && noSelfAssignment) {
    return [];
  }

  return [
    {
      type: 'INVALID_SIDE_ASSIGNMENT',
      message: 'The side assignment does not consist of exactly the two participants in this pair.',
      participantIds: [participantAId, participantBId],
    },
  ];
}

// ---------------------------------------------------------------------------
// Round-level (complete proposed pairing) validation
// ---------------------------------------------------------------------------

export interface ProposedRoundPairing {
  pairs: ProposedPair[];
  bye: ByeAssignment | null;
}

export interface RoundValidationContext extends PairValidationContext {
  roundNumber: number;
}

/**
 * Validates a COMPLETE proposed round pairing: every individual pair
 * (via validatePair), the bye recipient's eligibility (via Phase 4A's
 * checkByeAssignment), that no participant appears more than once
 * across the whole proposal (pairs + bye combined), and that the
 * proposal is complete -- every active participant in the roster
 * appears exactly once, with nobody missing.
 *
 * Any single violation, anywhere, invalidates the whole proposed
 * pairing (`valid: false`); `violations` lists every problem found
 * across the whole proposal, not just the first.
 */
export function validateRoundPairing(proposed: ProposedRoundPairing, context: RoundValidationContext): ValidationResult {
  const violations: HardConstraintViolation[] = [];

  for (const pair of proposed.pairs) {
    const pairResult = validatePair(pair.participantAId, pair.participantBId, pair.sideAssignment, context);
    violations.push(...pairResult.violations);
  }

  if (proposed.bye) {
    violations.push(...checkByeAssignment(proposed.bye.tournamentParticipantId, context.participants));
  }

  const allAppearances: string[] = [];
  for (const pair of proposed.pairs) {
    allAppearances.push(pair.participantAId, pair.participantBId);
  }
  if (proposed.bye) {
    allAppearances.push(proposed.bye.tournamentParticipantId);
  }

  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const id of allAppearances) {
    if (seen.has(id)) {
      duplicated.add(id);
    }
    seen.add(id);
  }
  if (duplicated.size > 0) {
    violations.push({
      type: 'DUPLICATE_PARTICIPANT_IN_RESULT',
      message: `The following participant(s) appear more than once in the proposed pairing: ${[...duplicated].join(', ')}.`,
      participantIds: [...duplicated],
    });
  }

  const activeIds = context.participants.filter((p) => p.active).map((p) => p.tournamentParticipantId);
  const covered = new Set(allAppearances);
  const missing = activeIds.filter((id) => !covered.has(id));
  if (missing.length > 0) {
    violations.push({
      type: 'MISSING_PARTICIPANT_IN_RESULT',
      message: `The following active participant(s) are missing from the proposed pairing (not paired, and not given a bye): ${missing.join(', ')}.`,
      participantIds: missing,
    });
  }

  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Feasibility ("no legal pairing exists at all")
// ---------------------------------------------------------------------------

export interface PairingFeasibility {
  feasible: boolean;
  reasons: string[];
}

/**
 * A deliberately CONSERVATIVE check for the most clear-cut "no legal
 * pairing is even possible" case: there are active participants
 * needing a round, but not a single legal same-score candidate,
 * cross-score candidate, or bye candidate can be generated at all
 * (via Phase 4B's generateCandidates). This reuses candidate
 * generation rather than duplicating its constraint logic.
 *
 * This intentionally does NOT attempt to solve the general
 * matching-feasibility problem (e.g. "individual candidates exist,
 * but no combination of them covers every participant") -- that
 * requires an actual matching algorithm, which is optimizer-phase
 * work, out of scope here. A `feasible: true` result from this
 * function is therefore not a guarantee a complete legal pairing
 * exists, only that generation didn't hit the total-dead-end case.
 */
export function assessPairingFeasibility(input: SwissPairingInput): PairingFeasibility {
  const activeCount = input.participants.filter((p) => p.active).length;
  if (activeCount === 0) {
    return { feasible: true, reasons: [] };
  }

  const generated = generateCandidates(input);
  const totalCandidates =
    generated.sameScoreCandidates.length + generated.crossScoreCandidates.length + generated.byeCandidates.length;

  if (totalCandidates === 0) {
    return {
      feasible: false,
      reasons: [
        `No legal pairing or bye exists for ${activeCount} active participant(s): every possible pairing violates a hard constraint and no participant is eligible for a bye.`,
      ],
    };
  }

  return { feasible: true, reasons: [] };
}

// Re-exported for convenience so callers of this module don't also
// need to import from constraints.ts/bye.ts separately for the most
// common adjacent helpers.
export { computeScoreDifference, isEligibleForBye };
