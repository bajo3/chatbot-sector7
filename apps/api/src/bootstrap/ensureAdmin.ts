import { prisma } from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { env } from '../env.js';

/**
 * Ensures there is an admin user for first-time access.
 * - If admin exists: keeps password unless ADMIN_SEED_FORCE_RESET=true
 * - If admin doesn't exist: creates it using ADMIN_SEED_* env vars
 */
export async function ensureAdminUser(): Promise<void> {
  if (!env.ADMIN_SEED_ENABLED) return;

  const email = (env.ADMIN_SEED_EMAIL || '').toLowerCase().trim();
  const password = (env.ADMIN_SEED_PASSWORD || '').trim();
  const name = (env.ADMIN_SEED_NAME || 'Sector7 Admin').trim();

  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        name,
        role: 'ADMIN',
        passwordHash,
        isActive: true,
        isOnline: true,
      },
    });
    console.log(`[bootstrap] Admin created: ${email}`);
    return;
  }

  // Ensure role + active, optionally reset password
  const updateData: any = {
    role: 'ADMIN',
    isActive: true,
    name,
  };

  if (env.ADMIN_SEED_FORCE_RESET) {
    updateData.passwordHash = await bcrypt.hash(password, 10);
  }

  await prisma.user.update({ where: { email }, data: updateData });
  console.log(`[bootstrap] Admin ensured: ${email}${env.ADMIN_SEED_FORCE_RESET ? ' (password reset)' : ''}`);
}
