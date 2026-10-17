import { config } from '../lib/config.js';
import { queryOne, runInitSql } from '../lib/db.js';
import { seedBdot10kIfSparse } from '../seeds/bdot10kEnricher.js';

runInitSql();
const bdot10k = seedBdot10kIfSparse();

const count = (table: string) =>
  queryOne<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)?.n ?? 0;

console.log(`[db] Zresetowano ${config.dbPath}`);
if (bdot10k) {
  console.log(`[bdot10k] Zaimportowano ${bdot10k.inserted_trees} punktów i ${bdot10k.inserted_tasks} zadań z ${bdot10k.source}`);
}
console.log(
  `[db] users: ${count('users')}, species_dictionary: ${count('species_dictionary')}, ` +
    `trees: ${count('trees')}, tasks: ${count('tasks')}`,
);
