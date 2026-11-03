import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY = Buffer.from(config.security.encryptionKey, 'hex');

/** Encrypts UTF-8 text with AES-256-GCM. Output: v1:iv:tag:ciphertext (base64). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Unrecognised encrypted payload format');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/** Non-reversible display hint for a secret: shows only the last 4 characters. */
export function maskSecret(secret: string): string {
  const tail = secret.slice(-4);
  return `••••${tail}`;
}

// --- Passwords (scrypt, no native deps) ---------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N }, (err, key) => (err ? reject(err) : resolve(key)))
  );
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !nStr || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: parseInt(nStr, 10) }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
