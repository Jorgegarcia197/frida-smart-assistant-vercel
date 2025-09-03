import { generateId } from 'ai';
import { genSaltSync, hashSync } from 'bcrypt-ts';

export function generateHashedPassword(password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  return hash;
}

export function generateDummyPassword() {
  const password = generateId();
  const hashedPassword = generateHashedPassword(password);

  return hashedPassword;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return undefined as any;

  // Arrays: clean each element and remove undefined
  if (Array.isArray(value)) {
    const arr = (value as unknown[])
      .map(stripUndefinedDeep)
      .filter((v) => v !== undefined);
    return arr as unknown as T;
  }

  // Objects: skip undefined entries and clean recursively
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const isPlain = proto === Object.prototype || proto === null;
    if (isPlain) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const cleaned = stripUndefinedDeep(v);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out as T;
    }
  }

  return value;
}
