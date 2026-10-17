import { createApp } from './app.js';
import { config } from './lib/config.js';
import { isDatabaseInitialized, runInitSql } from './lib/db.js';

if (!isDatabaseInitialized()) {
  console.log(`[db] Brak schematu — inicjalizuję ${config.dbPath} z ${config.initSqlPath}`);
  runInitSql();
}

createApp().listen(config.port, () => {
  console.log(`[server] Tree Monitor API: http://localhost:${config.port}/api/health`);
  console.log(`[db] ${config.dbPath}`);
});
