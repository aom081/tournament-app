import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './lib/prisma';

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

const app = express();

// --- Security & Middleware ---
app.use(helmet());
app.use(cors({
  origin: CORS_ORIGIN,
}));
app.use(express.json());

// --- Health Check ---
app.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify DB connection by performing a simple query
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    next(error);
  }
});

// --- Basic Routing Structure ---
// This is where future routers (e.g., from src/routes) will be mounted.
// Example: app.use('/api/tournaments', tournamentRoutes);

// --- Error Handling ---
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`🌐 CORS origin set to: ${CORS_ORIGIN}`);
});

// --- Graceful Shutdown ---
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (err) {
      console.error('Error during Prisma disconnect:', err);
    }
    process.exit(0);
  });

  // Force exit after 10s if server.close hangs
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
