import type { Role } from '../types.js';
import { SENSITIVE_FIELDS } from './constants.js';

type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

const sensitive = new Set<string>(SENSITIVE_FIELDS);

function stripDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDeep);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (!sensitive.has(key)) {
        result[key] = stripDeep(nested);
      }
    }
    return result;
  }
  return value;
}

/** Removes contract and funding fields (also in nested objects/arrays) for contractors. */
export function sanitizeForRole<T>(data: T, role: Role): T {
  return role === 'contractor' ? (stripDeep(data) as T) : data;
}

export function stripSensitive<T extends object>(data: T): Omit<T, SensitiveField> {
  return stripDeep(data) as Omit<T, SensitiveField>;
}
