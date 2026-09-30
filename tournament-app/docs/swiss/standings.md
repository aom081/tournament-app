# Swiss Standings

The standings system transforms match outcomes into a ranked list of participants. To ensure data integrity and correctness, the system follows a strict bottom-up aggregation pipeline.

## Result Pipeline
The pipeline is unidirectional. Any change to a raw result triggers a full recalculation of the downstream aggregates.

`Match Result` $\rightarrow$ `Tournament Result` $\rightarrow$ `Standings` $\rightarrow$ `Tie-break` $\rightarrow$ `Ranking`

1. **Match Result**: The raw outcome of a match (Winner/Draw).
2. **Tournament Result**: Aggregated stats per participant (Total Points, Wins, Losses, Draws, Game Differential).
3. **Standings**: A publishable snapshot of the rankings for a specific round or the entire tournament.
4. **Tie-break**: When primary points are equal, the system applies a configurable chain of tie-break strategies.
5. **Ranking**: The final deterministic rank (1, 2, 3...).

## Calculation Logic
Standings are calculated based on:
- **Primary Score**: Derived from the tournament's scoring configuration (e.g., Win=1, Draw=0.5, Loss=0).
- **Byes**: Byes are treated as wins (adding points and a win count) to ensure participants are not penalized for the odd-number-of-players scenario.
- **Game Differential**: The difference between total units won and total units lost across all matches.

## Publishing
Rankings are not automatically public. An organizer must "Publish" the standings for a round, which creates an immutable snapshot in the `Standing` table. This prevents participants from seeing fluctuating ranks during the result-entry process.
