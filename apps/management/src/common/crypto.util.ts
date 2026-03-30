import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const DEFAULT_DEV_KEY = 'dev-smtp-encryption-key-32chars!!';

function getKey(): Buffer {
  const k = process.env.SMTP_ENCRYPTION_KEY ?? DEFAULT_DEV_KEY;
  if (k.length < 32) throw new Error('SMTP_ENCRYPTION_KEY must be at least 32 characters');
  return Buffer.from(k.slice(0, 32));
}

/** Returns `ivHex:authTagHex:dataHex` */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${data.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
