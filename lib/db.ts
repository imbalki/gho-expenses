import { PrismaClient } from '@prisma/client';

// Prevents creating a new Prisma client on every hot-reload / serverless
// invocation in dev — standard Next.js + Prisma pattern.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
