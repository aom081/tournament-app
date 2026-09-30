import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import authRoute from './routes/auth.route';
import healthRoute from './routes/health.route';
import tournamentRoute from './routes/tournament.route';
import standingsRoute from './routes/standings.route';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  // Route mounting point. Future domain routers should be mounted
  // here, each under its own versioned prefix (e.g. /api/v1/...),
  // following the same pattern as healthRoute/authRoute/tournamentRoute.
  app.use('/api/v1', healthRoute);
  app.use('/api/v1', authRoute);
  app.use('/api/v1', tournamentRoute);
  app.use('/api/v1/tournaments/:tournamentId/standings', standingsRoute);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
