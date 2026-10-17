import { Router } from 'express';
import { queryAll } from '../lib/db.js';
import { getUser } from '../lib/http.js';
import { sanitizeForRole } from '../lib/sanitize.js';
import type { TreeListItem } from '../types.js';

export const treesRouter = Router();

const TREE_LIST_SQL = `
  SELECT t.*,
         s.polish_name AS species_polish_name,
         s.latin_name  AS species_latin_name,
         s.cultivar    AS species_cultivar,
         u.full_name   AS contractor_name
    FROM trees t
    JOIN species_dictionary s ON s.id = t.species_id
    LEFT JOIN users u ON u.id = t.contractor_id
   ORDER BY t.created_at, t.code`;

treesRouter.get('/', (req, res) => {
  const user = getUser(req);
  const trees = queryAll<TreeListItem>(TREE_LIST_SQL);
  res.json(sanitizeForRole(trees, user.role));
});
