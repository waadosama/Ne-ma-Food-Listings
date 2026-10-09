import config from './index.js';

// Single source of truth for database settings. Kept separate from config
// so the database layer can be swapped or tested on its own.
const databaseConfig = {
  connectionString: config.databaseUrl,
  // Reasonable defaults for a small MVP; tune these under real load later.
  max: 10,
  idleTimeoutMillis: 30000,
};

export default databaseConfig;
