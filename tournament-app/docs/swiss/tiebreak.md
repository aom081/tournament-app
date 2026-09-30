# Swiss Tie-break System

To maintain sport-agnosticism, the tournament application uses a pluggable Tie-break system. Instead of hard-coding a specific rule, the system uses a **Strategy Pattern** to resolve ranking disputes.

## Tie-break Strategy
A tie-break strategy is a function that assigns a numeric value to a participant based on their performance and the performance of their opponents. A higher value indicates a better rank.

### Supported Strategies
The following strategies are implemented:

| Strategy | Logic |
|---|---|
| **Buchholz** | Sum of the primary scores of all opponents played. |
| **Sonneborn-Berger** | Sum of (Opponent Score $\times$ Result), where Result is 1 for a win and 0.5 for a draw. |
| **Game Differential** | (Total Units Won) - (Total Units Lost). |
| **Opponent Score** | Simple aggregation of opponent scores. |
| **Cumulative Score** | Sum of opponent scores at the time they were played. |

## Resolution Process
When two or more participants have the same primary score, the **Tie-break Resolver** applies the configured criteria in lexicographical order:

1. **Criterion 1**: If one participant has a higher value, they are ranked higher.
2. **Criterion 2**: If they are still tied, the second strategy is applied.
3. **...**
4. **Final Fallback**: If all configured strategies tie, the **Tournament Participant Number (TPN)** is used. A lower TPN (earlier registration) breaks the tie.

This process ensures that rankings are **100% deterministic**.

## Configuration
Tie-breaks are configured per tournament in the `configuration` JSON:

```json
{
  "tiebreakCriteria": ["BUCHHOLZ", "GAME_DIFFERENTIAL", "SONNEBORN_BERGER"]
}
```
The system will apply these three rules in the exact order listed.
