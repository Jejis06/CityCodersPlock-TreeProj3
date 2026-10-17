import type { NextFunction, Request, Response } from 'express';
import { queryOne } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import type { User } from '../types.js';

export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.header('x-user-id');
  if (!userId) {
    throw new HttpError(401, 'Brak nagłówka x-user-id. Wybierz konto na ekranie startowym.');
  }

  const user = queryOne<User>('SELECT id, full_name, role, device FROM users WHERE id = :id', {
    id: userId,
  });
  if (!user) {
    throw new HttpError(401, 'Nieznany użytkownik.');
  }

  req.user = { ...user };
  next();
}
