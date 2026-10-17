import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from './lib/config.js';
import { HttpError } from './lib/http.js';
import { currentUser } from './middleware/currentUser.js';
import { geocodeRouter } from './routes/geocode.js';
import { speciesRouter } from './routes/species.js';
import { tasksRouter } from './routes/tasks.js';
import { treesRouter } from './routes/trees.js';
import { uploadsRouter } from './routes/uploads.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(config.uploadsDir));

  // Public endpoints (no x-user-id)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  app.use('/api/users', usersRouter);

  // Everything below requires x-user-id
  app.use('/api', currentUser);
  app.use('/api/species', speciesRouter);
  app.use('/api/geocode', geocodeRouter);
  app.use('/api/trees', treesRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Nie znaleziono endpointu.');
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.details });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Błąd uploadu: ${err.message}` });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/constraint failed/i.test(message)) {
      res.status(400).json({ error: `Nieprawidłowe dane: ${message}` });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Wewnętrzny błąd serwera.' });
  });

  return app;
}
