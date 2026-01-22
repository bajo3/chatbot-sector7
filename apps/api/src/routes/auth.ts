import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { signJwt } from '../auth/jwt.js';
import { z } from 'zod';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signJwt({ sub: user.id, role: user.role, name: user.name, email: user.email });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
