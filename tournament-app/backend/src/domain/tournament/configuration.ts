import { AppError } from '../../middleware/error-handler';

// Local mirror of the Prisma TournamentFormat enum. Kept as a plain
// string union (rather than importing @prisma/client) so this module
// has zero dependency on the generated Prisma Client and is testable
// without a database -- must be kept in sync with
// prisma/schema.prisma's `enum TournamentFormat`.
export type TournamentFormat = 'SWISS' | 'KNOCKOUT' | 'ROUND_ROBIN' | 'SWISS_TO_KNOCKOUT';

export type PairingMethod = 'MANUAL' | 'SWISS' | 'ROUND_ROBIN' | 'KNOCKOUT_BRACKET';
export type WinCondition = 'BEST_OF' | 'FIXED_UNITS';
export type TieBreakCriterion = 'BUCHHOLZ' | 'SONNEBORN_BERGER' | 'HEAD_TO_HEAD' | 'WINS' | 'GAME_WIN_PERCENTAGE';

export interface TournamentConfiguration {
  participants: {
    minParticipants: number;
    maxParticipants: number | null;
    /** Reserved for a future phase: registering after the
     * REGISTRATION window closes is not implemented yet (see
     * docs/tournament/configuration.md §4). */
    allowLateRegistration: boolean;
  };
  scoring: {
    winPoints: number;
    drawPoints: number;
    lossPoints: number;
  };
  matchFormat: {
    unitsPerMatch: number;
    winCondition: WinCondition;
  };
  pairing: {
    method: PairingMethod;
    avoidRematches: boolean;
  };
  tieBreak: {
    criteria: TieBreakCriterion[];
  };
  resultConfirmation: {
    requireOpponentConfirmation: boolean;
    requireOrganizerConfirmation: boolean;
    autoConfirmAfterHours: number | null;
  };
}

const PAIRING_METHODS: PairingMethod[] = ['MANUAL', 'SWISS', 'ROUND_ROBIN', 'KNOCKOUT_BRACKET'];
const WIN_CONDITIONS: WinCondition[] = ['BEST_OF', 'FIXED_UNITS'];
const TIE_BREAK_CRITERIA: TieBreakCriterion[] = ['BUCHHOLZ', 'SONNEBORN_BERGER', 'HEAD_TO_HEAD', 'WINS', 'GAME_WIN_PERCENTAGE'];

function defaultPairingMethodForFormat(format: TournamentFormat): PairingMethod {
  switch (format) {
    case 'SWISS':
    case 'SWISS_TO_KNOCKOUT':
      return 'SWISS';
    case 'KNOCKOUT':
      return 'KNOCKOUT_BRACKET';
    case 'ROUND_ROBIN':
      return 'ROUND_ROBIN';
    default: {
      const exhaustiveCheck: never = format;
      return exhaustiveCheck;
    }
  }
}

/** A complete, reasonable default configuration for a newly-created
 * tournament of the given format. Callers may override any subset via
 * `validateConfiguration` at creation/update time. */
export function defaultConfiguration(format: TournamentFormat): TournamentConfiguration {
  return {
    participants: { minParticipants: 2, maxParticipants: null, allowLateRegistration: false },
    scoring: { winPoints: 1, drawPoints: 0.5, lossPoints: 0 },
    matchFormat: { unitsPerMatch: 1, winCondition: 'FIXED_UNITS' },
    pairing: { method: defaultPairingMethodForFormat(format), avoidRematches: true },
    tieBreak: { criteria: ['WINS'] },
    resultConfirmation: { requireOpponentConfirmation: true, requireOrganizerConfirmation: false, autoConfirmAfterHours: 24 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value > 0;
}

function requireRecord(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  return value;
}

/**
 * Validates and normalizes an arbitrary (e.g. HTTP request body or
 * stored JSON) value into a well-formed TournamentConfiguration.
 * Throws a single AppError(400) listing every problem found, rather
 * than failing on the first one, so a caller gets complete feedback
 * in one round trip.
 */
export function validateConfiguration(input: unknown): TournamentConfiguration {
  const errors: string[] = [];
  const root = requireRecord(input, 'configuration', errors);

  let participants: TournamentConfiguration['participants'] = {
    minParticipants: 2,
    maxParticipants: null,
    allowLateRegistration: false,
  };
  const participantsRaw = root ? requireRecord(root.participants, 'configuration.participants', errors) : null;
  if (participantsRaw) {
    let minParticipants = 2;
    let maxParticipants: number | null = null;

    if (!isPositiveInteger(participantsRaw.minParticipants)) {
      errors.push('configuration.participants.minParticipants must be a positive integer');
    } else {
      minParticipants = participantsRaw.minParticipants;
    }

    if (participantsRaw.maxParticipants !== null && participantsRaw.maxParticipants !== undefined) {
      if (!isPositiveInteger(participantsRaw.maxParticipants)) {
        errors.push('configuration.participants.maxParticipants must be a positive integer or null');
      } else {
        maxParticipants = participantsRaw.maxParticipants;
      }
    }

    if (maxParticipants !== null && minParticipants > maxParticipants) {
      errors.push('configuration.participants.minParticipants cannot exceed maxParticipants');
    }

    if (typeof participantsRaw.allowLateRegistration !== 'boolean') {
      errors.push('configuration.participants.allowLateRegistration must be a boolean');
    }

    participants = {
      minParticipants,
      maxParticipants,
      allowLateRegistration: Boolean(participantsRaw.allowLateRegistration),
    };
  }

  let scoring: TournamentConfiguration['scoring'] = { winPoints: 1, drawPoints: 0.5, lossPoints: 0 };
  const scoringRaw = root ? requireRecord(root.scoring, 'configuration.scoring', errors) : null;
  if (scoringRaw) {
    for (const key of ['winPoints', 'drawPoints', 'lossPoints'] as const) {
      if (!isFiniteNumber(scoringRaw[key]) || (scoringRaw[key] as number) < 0) {
        errors.push(`configuration.scoring.${key} must be a non-negative number`);
      }
    }
    scoring = {
      winPoints: isFiniteNumber(scoringRaw.winPoints) ? scoringRaw.winPoints : 1,
      drawPoints: isFiniteNumber(scoringRaw.drawPoints) ? scoringRaw.drawPoints : 0.5,
      lossPoints: isFiniteNumber(scoringRaw.lossPoints) ? scoringRaw.lossPoints : 0,
    };
  }

  let matchFormat: TournamentConfiguration['matchFormat'] = { unitsPerMatch: 1, winCondition: 'FIXED_UNITS' };
  const matchFormatRaw = root ? requireRecord(root.matchFormat, 'configuration.matchFormat', errors) : null;
  if (matchFormatRaw) {
    if (!isPositiveInteger(matchFormatRaw.unitsPerMatch)) {
      errors.push('configuration.matchFormat.unitsPerMatch must be a positive integer');
    }
    if (!WIN_CONDITIONS.includes(matchFormatRaw.winCondition as WinCondition)) {
      errors.push(`configuration.matchFormat.winCondition must be one of: ${WIN_CONDITIONS.join(', ')}`);
    }
    matchFormat = {
      unitsPerMatch: isPositiveInteger(matchFormatRaw.unitsPerMatch) ? matchFormatRaw.unitsPerMatch : 1,
      winCondition: WIN_CONDITIONS.includes(matchFormatRaw.winCondition as WinCondition)
        ? (matchFormatRaw.winCondition as WinCondition)
        : 'FIXED_UNITS',
    };
  }

  let pairing: TournamentConfiguration['pairing'] = { method: 'MANUAL', avoidRematches: true };
  const pairingRaw = root ? requireRecord(root.pairing, 'configuration.pairing', errors) : null;
  if (pairingRaw) {
    if (!PAIRING_METHODS.includes(pairingRaw.method as PairingMethod)) {
      errors.push(`configuration.pairing.method must be one of: ${PAIRING_METHODS.join(', ')}`);
    }
    if (typeof pairingRaw.avoidRematches !== 'boolean') {
      errors.push('configuration.pairing.avoidRematches must be a boolean');
    }
    pairing = {
      method: PAIRING_METHODS.includes(pairingRaw.method as PairingMethod) ? (pairingRaw.method as PairingMethod) : 'MANUAL',
      avoidRematches: Boolean(pairingRaw.avoidRematches),
    };
  }

  let tieBreak: TournamentConfiguration['tieBreak'] = { criteria: ['WINS'] };
  const tieBreakRaw = root ? requireRecord(root.tieBreak, 'configuration.tieBreak', errors) : null;
  if (tieBreakRaw) {
    const criteria = tieBreakRaw.criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
      errors.push('configuration.tieBreak.criteria must be a non-empty array');
    } else if (!criteria.every((c) => TIE_BREAK_CRITERIA.includes(c as TieBreakCriterion))) {
      errors.push(`configuration.tieBreak.criteria may only contain: ${TIE_BREAK_CRITERIA.join(', ')}`);
    } else {
      tieBreak = { criteria: criteria as TieBreakCriterion[] };
    }
  }

  let resultConfirmation: TournamentConfiguration['resultConfirmation'] = {
    requireOpponentConfirmation: true,
    requireOrganizerConfirmation: false,
    autoConfirmAfterHours: 24,
  };
  const resultConfirmationRaw = root ? requireRecord(root.resultConfirmation, 'configuration.resultConfirmation', errors) : null;
  if (resultConfirmationRaw) {
    if (typeof resultConfirmationRaw.requireOpponentConfirmation !== 'boolean') {
      errors.push('configuration.resultConfirmation.requireOpponentConfirmation must be a boolean');
    }
    if (typeof resultConfirmationRaw.requireOrganizerConfirmation !== 'boolean') {
      errors.push('configuration.resultConfirmation.requireOrganizerConfirmation must be a boolean');
    }
    const autoConfirm = resultConfirmationRaw.autoConfirmAfterHours;
    if (autoConfirm !== null && autoConfirm !== undefined && !isPositiveInteger(autoConfirm)) {
      errors.push('configuration.resultConfirmation.autoConfirmAfterHours must be a positive integer or null');
    }
    resultConfirmation = {
      requireOpponentConfirmation: Boolean(resultConfirmationRaw.requireOpponentConfirmation),
      requireOrganizerConfirmation: Boolean(resultConfirmationRaw.requireOrganizerConfirmation),
      autoConfirmAfterHours: isPositiveInteger(autoConfirm) ? autoConfirm : null,
    };
  }

  if (errors.length > 0) {
    throw new AppError(`Invalid tournament configuration: ${errors.join('; ')}`, 400);
  }

  return { participants, scoring, matchFormat, pairing, tieBreak, resultConfirmation };
}
