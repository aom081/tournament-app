import { BracketLayout, BracketOptions, KnockoutMatch, AdvancementMap } from './types';
import { v4 as uuidv4 } from 'uuid';

export class KnockoutEngine {
  /**
   * Generates a bracket layout based on the number of participants and options.
   * Implements Power-of-Two expansion and standard tournament seeding.
   */
  static generateLayout(participantIds: string[], options: BracketOptions): BracketLayout {
    const N = participantIds.length;
    if (N < 2) {
      throw new Error('At least 2 participants are required for a knockout bracket.');
    }

    const bracketSize = options.bracketSize || this.calculateNextPowerOfTwo(N);
    const byesCount = bracketSize - N;

    // 1. Determine the ordered list of participants based on seeding
    const orderedParticipants = this.orderParticipants(participantIds, options);

    // 2. Create the Round 1 matches
    const round1: KnockoutMatch[] = [];
    const matchCount = bracketSize / 2;

    // Standard Seeding Pattern for Round 1: (1, 16), (8, 9), (5, 12), (4, 13), (3, 14), (6, 11), (7, 10), (2, 15)
    // For simplicity and genericity, we use a balanced pairing:
    // Participant i plays (bracketSize + 1 - i)

    // First, expand the participant list with "BYE" markers
    const expandedParticipants = [...orderedParticipants];
    while (expandedParticipants.length < bracketSize) {
      expandedParticipants.push(null); // Bye
    }

    for (let i = 0; i < matchCount; i++) {
      // Pair index i with index (bracketSize - 1 - i)
      const p1 = expandedParticipants[i];
      const p2 = expandedParticipants[bracketSize - 1 - i];

      round1.push({
        id: uuidv4(),
        roundNumber: 1,
        matchNumber: i + 1,
        participants: {
          slot1: p1,
          slot2: p2,
        },
        nextMatchId: null, // Set in the next step
        isBye: p1 === null || p2 === null,
      });
    }

    // 3. Generate subsequent rounds and link matches
    const rounds: KnockoutMatch[][] = [round1];
    let currentRoundMatches = round1;

    while (currentRoundMatches.length > 1) {
      const nextRound: KnockoutMatch[] = [];
      const nextMatchCount = currentRoundMatches.length / 2;

      for (let i = 0; i < nextMatchCount; i++) {
        nextRound.push({
          id: uuidv4(),
          roundNumber: rounds.length + 1,
          matchNumber: i + 1,
          participants: {
            slot1: null,
            slot2: null,
          },
          nextMatchId: null,
          isBye: false,
        });
      }

      // Link current round matches to the next round matches
      for (let i = 0; i < currentRoundMatches.length; i++) {
        const nextMatchIdx = Math.floor(i / 2);
        currentRoundMatches[i].nextMatchId = nextRound[nextMatchIdx].id;
      }

      rounds.push(nextRound);
      currentRoundMatches = nextRound;
    }

    return {
      bracketSize,
      rounds,
    };
  }

  /**
   * Maps a match to its next match and the specific slot the winner should occupy.
   */
  static getAdvancementMap(matchId: string, layout: BracketLayout): AdvancementMap | null {
    for (const round of layout.rounds) {
      const match = round.find(m => m.id === matchId);
      if (match) {
        if (!match.nextMatchId) return null;

        // If matchNumber is odd, winner goes to slot 1. If even, slot 2.
        const targetSlot = match.matchNumber % 2 !== 0 ? 1 : 2;

        return {
          matchId,
          nextMatchId: match.nextMatchId,
          targetSlot: targetSlot as 1 | 2,
        };
      }
    }
    return null;
  }

  private static calculateNextPowerOfTwo(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }

  private static orderParticipants(ids: string[], options: BracketOptions): string[] {
    if (options.seeding === 'RANDOM') {
      const shuffled = [...ids];
      if (options.randomSeed) {
        // Simple deterministic shuffle using a seed
        this.deterministicShuffle(shuffled, options.randomSeed);
      } else {
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
      }
      return shuffled;
    }
    // For 'SEEDED', we assume the ids are passed in order of seed (1, 2, 3...)
    return ids;
  }

  private static deterministicShuffle(array: any[], seed: string): void {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }

    const random = () => {
      hash = (hash * 16807) % 2147483647;
      return (hash - 1) / 2147483646;
    };

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}
