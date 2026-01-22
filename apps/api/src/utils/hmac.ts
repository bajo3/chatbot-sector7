import crypto from 'crypto';

export function verifyHubSignature(rawBody: Buffer, appSecret: string, headerValue?: string | string[]) {
  if (!headerValue) return false;
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  // expected format: sha256=HEX
  const m = /^sha256=(.+)$/.exec(v);
  if (!m) return false;
  const expected = m[1];
  const digest = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  // timing-safe compare
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(digest, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
