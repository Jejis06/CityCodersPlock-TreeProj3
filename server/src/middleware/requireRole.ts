import type { NextFunction, Request, Response } from 'express';
import { getUser, HttpError } from '../lib/http.js';
import type { Role } from '../types.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!roles.includes(getUser(req).role)) {
      throw new HttpError(403, 'Brak uprawnień do tej operacji.');
    }
    next();
  };
}
