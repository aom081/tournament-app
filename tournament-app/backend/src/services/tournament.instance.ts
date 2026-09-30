import { prisma } from '../lib/prisma';

import { createTournamentService } from './tournament.service';

export const tournamentService = createTournamentService({ prisma });
