# Knockout Tournament Engine

## Overview
The Knockout Engine is a generic implementation of a single-elimination tournament bracket. It decouples the structural definition of the bracket from the operational advancement of winners.

### Core Principles
- **Structural Decoupling**: The `KnockoutEngine` (domain layer) calculates the tree of matches without knowing about the database. The `KnockoutService` (service layer) persists this structure.
- **Power-of-Two Scaling**: Brackets are always scaled to the nearest power of 2. Participants who do not fill a slot are assigned "Byes".
- **Result-Driven Advancement**: Participants only move to the next round when a `MatchResult` (represented by `Match.winnerTournamentParticipantId`) is finalized.

## Bracket Generation
Brackets are generated based on the number of participants ($N$).

1. **Size Calculation**: The bracket size $S$ is the smallest power of 2 such that $S \ge N$.
2. **Seeding**:
   - **Seeded**: Participants are paired using a balanced tournament structure (e.g., 1 vs $S$, 2 vs $S-1$).
   - **Random**: Participants are shuffled (optionally deterministically) before pairing.
3. **Byes**: Byes are assigned to the top-seeded participants. A match containing a Bye is automatically marked as `MatchStatus.BYE` and its only participant advances immediately.

## Advancement Flow
When a match is completed:
1. The `winnerTournamentParticipantId` is recorded.
2. The engine identifies the `nextMatchId` using the bracket's tree structure.
3. The winner is placed into the correct slot (1 or 2) of the next match based on whether the current match was the "top" or "bottom" feeder of that next match.
4. If no `nextMatchId` exists, the match is the Final, and the tournament status is updated to `COMPLETED`.

## Testing and Verification
The engine is verified against a matrix of participant counts (2, 4, 8, 16) and seeding configurations to ensure that the bracket structure is always valid and that winners advance correctly.
