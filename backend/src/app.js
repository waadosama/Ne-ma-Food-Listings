import express from 'express';
import routes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

// The Express app is built and exported separately from the server so it
// can be imported in tests without binding to a port.
export function createApp() {
  const app = express();

  app.use(express.json());

  app.use('/api', routes);

  // 404 and error handling must come after the routes.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
