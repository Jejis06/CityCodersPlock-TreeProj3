import { Router } from 'express';
import { queryAll } from '../lib/db.js';
import type { User } from '../types.js';

export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  const users = queryAll<User>(
    `SELECT id, full_name, role, device FROM users
      ORDER BY CASE role WHEN 'official' THEN 0 ELSE 1 END, id`,
  );
  res.json(users);
});
