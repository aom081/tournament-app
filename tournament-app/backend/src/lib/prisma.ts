import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client singleton to avoid multiple instances during hot-reloads
 * in development (ts-node-dev).
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
