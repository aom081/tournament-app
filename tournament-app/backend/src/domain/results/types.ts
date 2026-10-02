export enum UnitResultType {
  WIN_LOSS = 'WIN_LOSS',
  DRAW = 'DRAW',
  FORFEIT = 'FORFEIT',
  ABANDONED = 'ABANDONED',
  VOID = 'VOID',
}

export interface UpdateUnitResultDto {
  status: UnitStatus;
  winnerTournamentParticipantId?: string | null;
  resultType: UnitResultType;
  voidReason?: string;
}

export interface UnitValidationContext {
  unit: any; // Prisma Unit
  match: any; // Prisma Match
  participants: any[]; // Prisma MatchParticipant[]
  config: any; // TournamentConfiguration
}
