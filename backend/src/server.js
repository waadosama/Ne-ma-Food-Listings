import { createApp } from './app.js';
import config from './config/index.js';

// Entry point: builds the app and starts listening. Kept minimal so the
// Express wiring in app.js stays testable on its own.
const app = createApp();

app.listen(config.port, () => {
  console.log(`Ne'ma API listening on http://localhost:${config.port}`);
});
