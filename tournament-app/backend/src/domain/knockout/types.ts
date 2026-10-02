export type SeedingOption = 'RANDOM' | 'SEEDED';

export interface BracketOptions {
  seeding: SeedingOption;
  randomSeed?: string;
  bracketSize?: number;
}

export interface KnockoutMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;
  participants: {
    slot1: string | null; // Participant ID or null for Bye
    slot2: string | null; // Participant ID or null for Bye
  };
  nextMatchId: string | null;
  isBye: boolean;
}

export interface BracketLayout {
  bracketSize: number;
  rounds: KnockoutMatch[][]; // Outer array is round, inner is matches in that round
}

export interface AdvancementMap {
  matchId: string;
  nextMatchId: string | null;
  targetSlot: 1 | 2;
}
