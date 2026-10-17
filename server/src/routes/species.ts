import { Router } from 'express';
import { queryAll } from '../lib/db.js';
import type { Species } from '../types.js';

export const speciesRouter = Router();

const normalize = (value: string) => value.toLocaleLowerCase('pl-PL').replaceAll("'", '');

// SQLite LIKE is case-insensitive only for ASCII, so Polish names are filtered in JS (100 rows).
speciesRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? normalize(req.query.q.trim()) : '';
  const type = req.query.type === 'tree' || req.query.type === 'shrub' ? req.query.type : null;

  const species = queryAll<Species>(
    'SELECT id, type, polish_name, latin_name, cultivar FROM species_dictionary ORDER BY id',
  ).filter(
    (s) =>
      (!type || s.type === type) &&
      (!q || normalize(`${s.polish_name} ${s.latin_name} ${s.cultivar ?? ''}`).includes(q)),
  );

  res.json(species);
});
