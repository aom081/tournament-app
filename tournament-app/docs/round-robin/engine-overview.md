# Round-Robin Engine Overview

## Scheduling Logic
The Round-Robin engine uses the **Circle Method** (Berger Table) to ensure a fair and deterministic schedule where every participant plays every other participant exactly once.

### The Algorithm
1. **Normalization**: If the number of participants $N$ is odd, a virtual "BYE" participant is added.
2. **Fixed-Point Rotation**: Participant 1 remains fixed at the start of the list. All other participants rotate clockwise each round.
3. **Pairing**: In each round, participants are paired from opposite ends of the list: (1 vs $N$), (2 vs $N-1$), etc.
4. **Total Rounds**: $N-1$ rounds for even $N$, and $N$ rounds for odd $N$.

## Scoring and Standings
The engine follows a strict result flow:
`Match Result` $\rightarrow$ `TournamentResult` $\rightarrow$ `Standing`.

### Scoring Flow
When a match is completed, the `RoundRobinService` updates the `TournamentResult` for both participants:
- **Wins**: Incremented based on `TournamentConfiguration.scoring.winPoints`.
- **Losses**: Incremented based on `TournamentConfiguration.scoring.lossPoints`.
- **Draws**: Incremented based on `TournamentConfiguration.scoring.drawPoints`.

### Standings Generation
Standings are snapshots that rank participants by:
1. Total Points.
2. Configured Tie-break criteria (e.g., Wins, Head-to-Head).
3. Seed (as a final deterministic fallback).
