import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id:true, name:true, email:true, role:true, isOnline:true }
  });
  return res.json(users);
});

usersRouter.post('/:id/online', async (req, res) => {
  const id = req.params.id;
  const isOnline = !!req.body?.isOnline;
  await prisma.user.update({ where: { id }, data: { isOnline } });
  return res.json({ ok:true });
});
