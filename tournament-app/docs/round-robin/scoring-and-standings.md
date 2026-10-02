# Scoring and Tie-breaks

This document explains how the Round-Robin engine calculates standings and handles ties.

## Scoring Configuration
The points awarded for each match outcome are defined in the `TournamentConfiguration` JSON:
- `scoring.winPoints`: Points awarded to the winner.
- `scoring.drawPoints`: Points awarded to each participant in a draw.
- `scoring.lossPoints`: Points awarded to the loser.

## The Standings Pipeline
Standings are calculated using a bottom-up aggregation:
1. **Aggregation**: Sum of all points from `TournamentResult`.
2. **Ranking**: Participants are sorted by points.
3. **Tie-breaking**: If points are equal, the system applies the criteria list in `TournamentConfiguration.tieBreak.criteria` (e.g., `['WINS', 'HEAD_TO_HEAD']`).

### Head-to-Head Tie-break
For Round-robin, the Head-to-Head tie-break is critical. If two participants are tied on points, the winner of the match between them is ranked higher.

## Result Correction
If a match result is corrected:
1. The `TournamentResult` for the participants is updated.
2. The global standings are recalculated.
3. A new `Standing` snapshot is published.
