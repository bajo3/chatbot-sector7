import jwt from 'jsonwebtoken';
import { env } from '../env.js';

// Keep JWT payload typing independent from Prisma runtime exports (ESM/CJS interop).
export type Role = 'ADMIN' | 'SELLER';

export type JwtPayload = { sub: string; role: Role; name: string; email: string };

export function signJwt(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
}

export function verifyJwt(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
