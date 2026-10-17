import { createApp } from './app.js';
import { config } from './lib/config.js';
import { isDatabaseInitialized, runInitSql } from './lib/db.js';
import { BDOT10K_MIN_TREES, seedBdot10kIfSparse } from './seeds/bdot10kEnricher.js';
import { applyDatabaseFixes } from './seeds/databaseFixes.js';

if (!isDatabaseInitialized()) {
  console.log(`[db] Brak schematu — inicjalizuję ${config.dbPath} z ${config.initSqlPath}`);
  runInitSql();
}

try {
  const seeded = seedBdot10kIfSparse();
  if (seeded) {
    console.log(
      `[bdot10k] < ${BDOT10K_MIN_TREES} roślin w bazie — zaimportowano ${seeded.inserted_trees} punktów ` +
        `i ${seeded.inserted_tasks} zadań z ${seeded.source} (razem: ${seeded.total_trees}).`,
    );
  }
} catch (error) {
  console.error('[bdot10k] Import nie powiódł się:', error);
}

try {
  const fixes = applyDatabaseFixes();
  if (fixes.removed_trees + fixes.greened_trees + fixes.approved_tasks > 0) {
    console.log(
      `[db-fixes] Usunięto ${fixes.removed_trees} roślin, ustawiono status "green" dla ${fixes.greened_trees}, ` +
        `zatwierdzono ${fixes.approved_tasks} zadań.`,
    );
  }
} catch (error) {
  console.error('[db-fixes] Migracja czyszcząca nie powiodła się:', error);
}

createApp().listen(config.port, () => {
  console.log(`[server] Tree Monitor API: http://localhost:${config.port}/api/health`);
  console.log(`[db] ${config.dbPath}`);
});
