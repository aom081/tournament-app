# Swiss to Knockout Flow

## Overview
The Swiss to Knockout flow manages the transition from the group/Swiss stage of a tournament to a single-elimination bracket. This ensures that only the top-performing participants advance and that their advancement is based on an immutable snapshot of the final standings.

## The Transition Process

### 1. Qualification
Once the Swiss stage is complete, the `SwissToKnockoutService` is used to identify qualifiers.
- **Top N Selection**: The system fetches the `TournamentResult` records for all participants and selects the top $N$ based on their final rank.
- **Snapshotting**: A `QualificationSnapshot` is created. This record freezes the participants' ranks, scores, and tie-break values at the moment of qualification.

### 2. Review and Publication
To provide organizers with control, the qualification process is split:
- **Propose**: A `DRAFT` snapshot is created. The organizer can review the list of qualified participants.
- **Finalize**: The snapshot is marked as `PUBLISHED`. This action locks the Swiss stage and triggers the generation of the knockout bracket.

### 3. Bracket Generation
The qualified participants are passed to the `KnockoutService`.
- **Seeding**: Participants are seeded based on their rank in the snapshot (Rank 1 $\rightarrow$ Seed 1).
- **Bracket Structure**: A balanced bracket is generated (e.g., 1 vs 8, 4 vs 5) to ensure top seeds are separated until the final rounds.

## Configuration
The following settings in `TournamentConfiguration` control this flow:
- `qualification.topN`: Number of participants advancing to the bracket.
- `qualification.seedingRule`: The method used to place participants in the bracket (`BALANCED` or `RANDOM`).
- `qualification.bestOfN`: The match format for the knockout stage (e.g., Best-of-3).

## Verification
The integration is verified via end-to-end tests that simulate the full lifecycle:
`Swiss Matches` $\rightarrow$ `Calculate Standings` $\rightarrow$ `Propose Qualification` $\rightarrow$ `Finalize` $\rightarrow$ `Generate Bracket`.
