import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from './jwt.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  if (!m) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = verifyJwt(m[1]);
    (req as any).user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
