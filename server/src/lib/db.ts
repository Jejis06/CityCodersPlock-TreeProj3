import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config.js';

export type SqlParams = Record<string, SQLInputValue>;

mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

export function runInitSql(): void {
  db.exec(readFileSync(config.initSqlPath, 'utf8'));
  db.exec('PRAGMA foreign_keys = ON;');
}

export function isDatabaseInitialized(): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  return row !== undefined;
}

export function queryAll<T>(sql: string, params: SqlParams = {}): T[] {
  return db.prepare(sql).all(params) as unknown as T[];
}

export function queryOne<T>(sql: string, params: SqlParams = {}): T | undefined {
  return db.prepare(sql).get(params) as unknown as T | undefined;
}

export function execute(sql: string, params: SqlParams = {}): { changes: number } {
  const result = db.prepare(sql).run(params);
  return { changes: Number(result.changes) };
}

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const nowIso = (): string => new Date().toISOString();
