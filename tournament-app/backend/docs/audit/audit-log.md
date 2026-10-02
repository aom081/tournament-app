# Audit Log System

## Overview
The Audit Log system provides an immutable, append-only trail of all critical state changes within the tournament management system. Every significant administrative action is recorded to ensure transparency and facilitate dispute resolution.

## Audit Model
Each audit entry contains:
- **Actor**: The user who performed the action.
- **Action**: A specific event type (e.g., `GAME_RESULT_CORRECTED`).
- **Entity**: The type and ID of the record changed.
- **State Transition**: A JSON snapshot of the entity before and after the change.
- **Context**: A reason for the change and a correlation ID to link related events.

## Tracked Actions

### Tournament Lifecycle
- `TOURNAMENT_CREATED`: Initial creation.
- `TOURNAMENT_UPDATED`: Changes to name or configuration.
- `TOURNAMENT_STATUS_CHANGED`: Transitions (e.g., `DRAFT` $\to$ `REGISTRATION`).

### Participant Management
- `PARTICIPANT_REGISTERED`: Player added to tournament.
- `PARTICIPANT_REMOVED`: Player withdrawn or disqualified.

### Result Hierarchy
- `GAME_RESULT_SUBMITTED`: Initial result entry.
- `GAME_RESULT_CORRECTED`: Result changed by admin.
- `GAME_RESULT_VOIDED`: Result invalidated.
- `MATCH_RESULT_CONFIRMED`: Match marked as confirmed.
- `MATCH_RESULT_DISPUTED`: Match result challenged.

### Standings & Brackets
- `STANDINGS_RECALCULATED`: Manual trigger of the aggregation pipeline.
- `STANDINGS_PUBLISHED`: Standing snapshot created.
- `BRACKET_GENERATED`: Initial knockout bracket creation.
- `BRACKET_ADVANCED`: Participant advanced to next match.

## Correlation IDs
When a single action triggers a chain of updates (e.g., a `Unit` result change $\rightarrow$ `Match` winner change $\rightarrow$ `TournamentResult` update), all resulting audit logs share the same `correlationId`. This allows administrators to trace the "Butterfly Effect" of a single correction.
