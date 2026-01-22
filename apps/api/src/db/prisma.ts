// Prisma Client is CommonJS; under ESM (Node 20+/tsx) named exports can be unreliable.
// Use a default import for maximum compatibility.
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg as unknown as { PrismaClient: new () => any };

export const prisma = new PrismaClient();
