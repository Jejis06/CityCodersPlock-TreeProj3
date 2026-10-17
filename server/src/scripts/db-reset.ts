import { config } from '../lib/config.js';
import { queryOne, runInitSql } from '../lib/db.js';

runInitSql();

const count = (table: string) =>
  queryOne<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)?.n ?? 0;

console.log(`[db] Zresetowano ${config.dbPath}`);
console.log(
  `[db] users: ${count('users')}, species_dictionary: ${count('species_dictionary')}, ` +
    `trees: ${count('trees')}, tasks: ${count('tasks')}`,
);
