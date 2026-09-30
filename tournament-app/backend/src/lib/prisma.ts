import { PrismaClient } from '@prisma/client';

// Singleton Prisma client. Import this everywhere the app needs
// database access instead of constructing new PrismaClient() instances
// (each instance opens its own connection pool).
export const prisma = new PrismaClient();
