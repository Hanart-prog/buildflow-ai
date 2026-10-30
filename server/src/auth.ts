import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'buildflow_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt, KEY_LENGTH)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  return timingSafeEqual(await derive(password, salt, KEY_LENGTH), Buffer.from(key, 'hex'));
}

// Checked when an email has no account, so both cases take the same time.
export const NO_ACCOUNT_HASH = await hashPassword(randomBytes(16).toString('hex'));

export const newSessionToken = () => randomBytes(32).toString('base64url');

// Only the hash is stored, so a leaked database holds no working logins.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const readCookie = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.[1];

// Counts attempts per key inside a rolling window. Lives in memory, so a restart clears it.
export function attemptLimiter(limit: number, windowMs: number) {
  const seen = new Map<string, { count: number; resetAt: number }>();
  return {
    blocked(key: string) {
      const entry = seen.get(key);
      return !!entry && entry.resetAt > Date.now() && entry.count >= limit;
    },
    hit(key: string) {
      const entry = seen.get(key);
      if (!entry || entry.resetAt <= Date.now()) {
        if (seen.size >= 10000) seen.clear();
        seen.set(key, { count: 1, resetAt: Date.now() + windowMs });
      } else {
        entry.count += 1;
      }
    },
    clear: (key: string) => seen.delete(key),
  };
}
