import type { Request } from 'express';
import type { User } from '../types.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Current user set by the currentUser middleware; throws 401 if missing. */
export function getUser(req: Request): User {
  if (!req.user) {
    throw new HttpError(401, 'Brak zalogowanego użytkownika (nagłówek x-user-id).');
  }
  return req.user;
}
