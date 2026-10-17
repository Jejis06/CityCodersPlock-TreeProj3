import type { PlantType } from '../types.js';
import { queryOne } from './db.js';

export const codePrefix = (type: PlantType): 'D' | 'K' => (type === 'tree' ? 'D' : 'K');

/** Next free code, e.g. D8/2026 or K2/2026. Call inside the same transaction as the INSERT. */
export function nextTreeCode(type: PlantType, year: number = new Date().getFullYear()): string {
  const row = queryOne<{ code: string }>(
    `SELECT :prefix || (COALESCE(MAX(CAST(substr(code, 2, instr(code, '/') - 2) AS INTEGER)), 0) + 1) || '/' || :year AS code
       FROM trees
      WHERE substr(code, 1, 1) = :prefix AND substr(code, instr(code, '/') + 1) = :year`,
    { prefix: codePrefix(type), year: String(year) },
  );
  return row?.code ?? `${codePrefix(type)}1/${year}`;
}
