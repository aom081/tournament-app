// Swiss pairing engine - domain model (types only).
//
// PHASE 4A SCOPE: this file defines the vocabulary a future pairing
// engine will operate on. It does NOT decide any pairings itself.
// See docs/swiss/domain-model.md for full rationale.
//
// Naming: participantAId / participantBId are used throughout instead
// of any sport-specific pairing (e.g. whitePlayerId/blackPlayerId),
// per the domain rule that the application must remain generic.

/** Which "slot" a participant is assigned within a pairing. Generic
 * A/B labeling (not "white/black", not "home/away"). */
export type Side = 'A' | 'B';

export type SidePreference = Side | 'NONE';

/** How many times a participant has played each side, and which side
 * they played most recently -- used only to balance side assignment,
 * never to decide WHO plays whom. */
export interface SideBalance {
  countAsSideA: number;
  countAsSideB: number;
  lastSide: SidePreference;
}

export type FloatDirection = 'UP' | 'DOWN';

export interface FloatHistoryEntry {
  roundNumber: number;
  direction: FloatDirection;
}

/** Everything the pairing engine needs to know about one participant
 * going into a round, aggregated from tournament history. This is the
 * engine's view of a TournamentParticipant -- it is deliberately NOT
 * the Prisma model itself, so the engine has no direct database
 * dependency and can be tested with plain objects. */
export interface ParticipantPairingProfile {
  tournamentParticipantId: string;
  /** Tournament Participant Number: a stable, unique-per-tournament
   * integer assigned independently of skill/seeding, used as the
   * primary tiebreaker for deterministic ordering (see ordering.ts).
   * Unlike `seed`, this is always present and carries no skill
   * connotation -- it exists purely to make ordering reproducible. */
  tpn: number;
  /** Current tournament score (points), used for score-group grouping. */
  score: number;
  /** Optional pre-tournament seed, used only as a determinism
   * tiebreaker when scores are equal -- never as a pairing judgement. */
  seed: number | null;
  /** ids of every opponent already played, across all prior rounds. */
  opponentIds: string[];
  hasReceivedBye: boolean;
  sideBalance: SideBalance;
  floatHistory: FloatHistoryEntry[];
  /** false for withdrawn/disqualified participants: never eligible
   * for pairing or a bye. */
  active: boolean;
}

/**
 * Governs whether/how the engine may pair participants from
 * different score groups. `enabled`/`maxScoreDifference` are HARD
 * gates (a violation makes a candidate invalid). `requireOrganizerReview`
 * and `reviewThreshold` are informational flags only -- they can
 * never reject a candidate, only mark an otherwise-valid one for
 * human review before publication.
 */
export interface CrossScorePolicy {
  /** Whether cross-score-group pairing is permitted at all. */
  enabled: boolean;
  /** Hard cap on score difference for a cross-score pairing.
   * `null` = no explicit cap (still subject to `enabled`). */
  maxScoreDifference: number | null;
  /** Soft preference: when choosing among valid candidates, prefer
   * ones that stay within the same score group. */
  preferSameScore: boolean;
  /** Soft preference: when a cross-score pairing is unavoidable,
   * prefer the smallest score difference available. */
  minimizeScoreDifference: boolean;
  /** If true, EVERY cross-score pairing is flagged for organizer
   * review (does not reject it). */
  requireOrganizerReview: boolean;
  /** If set, a cross-score pairing whose score difference is >= this
   * value is flagged for organizer review, independent of
   * `requireOrganizerReview`. `null` disables this specific trigger. */
  reviewThreshold: number | null;
}

/** The soft preferences the engine uses to choose among multiple
 * already-VALID candidates. Applied strictly in order (see
 * ordering.ts) -- never blended into one weighted score. */
export type SoftPreferenceCriterion =
  | 'PREFER_SAME_SCORE_GROUP'
  | 'MINIMIZE_SCORE_DIFFERENCE'
  | 'MINIMIZE_FLOAT_REPETITION'
  | 'BALANCE_SIDE_HISTORY';

/** Full input to one execution of the pairing engine for a single
 * round. Everything the engine needs is passed in explicitly -- no
 * hidden database reads -- so a run is reproducible from its input. */
export interface SwissPairingInput {
  tournamentId: string;
  roundNumber: number;
  participants: ParticipantPairingProfile[];
  crossScorePolicy: CrossScorePolicy;
  /** Order in which soft preferences are consulted. */
  preferenceOrder: SoftPreferenceCriterion[];
  /** Explicit override to permit rematches. Default posture (false)
   * treats a rematch as a hard constraint violation. */
  allowRematches: boolean;
}

/** Participants sharing an identical score, in deterministic order. */
export interface ScoreGroup {
  score: number;
  memberIds: string[];
}

/**
 * The working set for one pairing iteration: a score group's own
 * ("resident") members plus anyone floated in from another group.
 * Constructing the *initial* bracket from a ScoreGroup is a purely
 * structural operation (see grouping.ts); deciding who floats in is
 * the pairing engine's job, out of scope for this phase.
 */
export interface PairingBracket {
  score: number;
  residentIds: string[];
  floatedInIds: string[];
}

export type HardConstraintType =
  | 'SELF_PAIRING'
  | 'REMATCH'
  | 'SCORE_DIFFERENCE_EXCEEDED'
  | 'CROSS_SCORE_NOT_ALLOWED'
  | 'PARTICIPANT_INACTIVE'
  | 'UNKNOWN_PARTICIPANT'
  | 'INVALID_BYE_RECIPIENT'
  | 'INVALID_SIDE_ASSIGNMENT'
  | 'DUPLICATE_PARTICIPANT_IN_RESULT'
  | 'MISSING_PARTICIPANT_IN_RESULT';

/** A single reason a candidate (or a whole result) is invalid. An
 * empty violation list means "valid" -- there is no partial-credit
 * numeric score, by design. */
export interface HardConstraintViolation {
  type: HardConstraintType;
  message: string;
  participantIds: string[];
}

/**
 * A single proposed pairing under consideration, carrying both the
 * facts needed to check hard constraints (`hardConstraintViolations`)
 * and precomputed facts needed to rank valid candidates by soft
 * preference (`floatRepeatCount`, `sideBalanceImprovement`). These two
 * concerns are represented separately and are never merged into one
 * number.
 */
export interface PairingCandidate {
  participantAId: string;
  participantBId: string;
  sameScoreGroup: boolean;
  scoreDifference: number;
  isRematch: boolean;
  /** 0, 1, or 2: how many of the two participants would repeat the
   * same float direction they had last round if paired this way. */
  floatRepeatCount: 0 | 1 | 2;
  /** Higher = this pairing improves side-history balance more.
   * A heuristic input to soft ordering only -- see side.ts. */
  sideBalanceImprovement: number;
  hardConstraintViolations: HardConstraintViolation[];
  /** The resolved side assignment for this candidate, when known.
   * Optional so existing callers constructing a PairingCandidate by
   * hand (e.g. for manual pairing review) aren't forced to supply it;
   * Phase 4B's generator always populates it, using
   * determineSideAssignment so that `participantAId`/`participantBId`
   * above correspond directly to `sideAssignment.sideAParticipantId`/
   * `sideBParticipantId` rather than being an arbitrary artifact of
   * generation order. */
  sideAssignment?: SideAssignment;
}

export interface SideAssignment {
  sideAParticipantId: string;
  sideBParticipantId: string;
}

export interface ByeAssignment {
  tournamentParticipantId: string;
  roundNumber: number;
}

/** A candidate that has been accepted into the round's final output,
 * with its position and side assignment resolved. */
export interface FinalizedPairing {
  participantAId: string;
  participantBId: string;
  /** Deterministic position of this pairing within the round's
   * output (generic term -- not "board number" or "table number"). */
  pairingOrder: number;
  scoreDifference: number;
  crossedScoreGroups: boolean;
  floatedParticipantIds: string[];
}

/** The full output of one pairing-engine execution for a round,
 * ahead of organizer review and publication. */
export interface PairingResult {
  tournamentId: string;
  roundNumber: number;
  pairings: FinalizedPairing[];
  bye: ByeAssignment | null;
  floats: Array<{ tournamentParticipantId: string; direction: FloatDirection }>;
  needsOrganizerReview: boolean;
  reviewReasons: string[];
}

export type PairingRunStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';

/**
 * The auditable record of one pairing-engine execution: its input,
 * its output, and its review/publication status. Modeled here as a
 * plain TypeScript type only -- NOT yet a persisted Prisma table.
 * Persistence is deferred until an actual engine (a later phase)
 * exists to write real ones; see docs/swiss/domain-model.md §6.
 */
export interface PairingRun {
  id: string;
  tournamentId: string;
  roundNumber: number;
  input: SwissPairingInput;
  result: PairingResult;
  status: PairingRunStatus;
  generatedAt: string;
  reviewedAt: string | null;
}
