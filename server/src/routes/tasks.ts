import type { Request, Response } from 'express';
import { Router } from 'express';
import { execute, nowIso, queryAll, queryOne, withTransaction } from '../lib/db.js';
import { HttpError, getUser } from '../lib/http.js';
import { sanitizeForRole } from '../lib/sanitize.js';
import { requireRole } from '../middleware/requireRole.js';
import type { Role, Task, TaskStatus } from '../types.js';

export const tasksRouter = Router();

const TASK_STATUSES: readonly TaskStatus[] = ['assigned', 'pending_approval', 'approved', 'rejected'];

/** Task joined with tree/species data needed by the map and cards. */
const TASK_LIST_SQL = `
  SELECT k.*,
         t.code        AS tree_code,
         t.type        AS tree_type,
         t.latitude    AS tree_latitude,
         t.longitude   AS tree_longitude,
         t.address     AS tree_address,
         t.status      AS tree_status,
         s.polish_name AS species_polish_name,
         s.latin_name  AS species_latin_name,
         s.cultivar    AS species_cultivar,
         lu.full_name  AS locked_by_name
    FROM tasks k
    JOIN trees t ON t.id = k.tree_id
    JOIN species_dictionary s ON s.id = t.species_id
    LEFT JOIN users lu ON lu.id = k.locked_by`;

/** Contractors never get contract/funding fields: dropped here and again by the sanitizer. */
function forRole<T extends object>(row: T, role: Role): T {
  return sanitizeForRole(row, role);
}

tasksRouter.get('/', (req, res) => {
  const user = getUser(req);
  const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
  const statuses = statusParam
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is TaskStatus => (TASK_STATUSES as readonly string[]).includes(s));

  const where: string[] = [];
  const params: Record<string, string> = {};
  if (user.role === 'contractor') {
    where.push('k.assigned_to = :userId');
    params.userId = user.id;
  }
  if (statuses.length > 0) {
    where.push(`k.status IN (${statuses.map((_, i) => `:s${i}`).join(', ')})`);
    statuses.forEach((s, i) => {
      params[`s${i}`] = s;
    });
  }
  const sql = `${TASK_LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY k.updated_at DESC`;
  res.json(queryAll<Task>(sql, params).map((row) => forRole(row, user.role)));
});

function completeTask(req: Request, res: Response): void {
  const user = getUser(req);
  const taskId = String(req.params.id);
  const body = (req.body ?? {}) as { photo_url?: unknown; comment?: unknown };

  const photoUrl = typeof body.photo_url === 'string' ? body.photo_url.trim() : '';
  if (!photoUrl) throw new HttpError(400, 'Zdjęcie potwierdzające wykonanie jest wymagane.');
  const comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;

  const task = withTransaction(() => {
    const existing = queryOne<Pick<Task, 'id' | 'tree_id' | 'status' | 'assigned_to'>>(
      'SELECT id, tree_id, status, assigned_to FROM tasks WHERE id = :id',
      { id: taskId },
    );
    if (!existing) throw new HttpError(404, 'Nie znaleziono zadania.');
    if (existing.assigned_to !== user.id) throw new HttpError(403, 'To zadanie nie jest przypisane do Ciebie.');
    if (existing.status !== 'assigned' && existing.status !== 'rejected') {
      throw new HttpError(409, 'Zadanie nie oczekuje na wykonanie.');
    }
    execute(
      `UPDATE tasks
          SET status = 'pending_approval', contractor_photo_url = :photo, contractor_comment = :comment,
              completed_at = :now, locked_by = NULL, locked_at = NULL
        WHERE id = :id`,
      { id: taskId, photo: photoUrl, comment, now: nowIso() },
    );
    execute("UPDATE trees SET status = 'yellow' WHERE id = :treeId", { treeId: existing.tree_id });
    return queryOne<Task>(`${TASK_LIST_SQL} WHERE k.id = :id`, { id: taskId });
  });

  res.json(forRole(task as Task, user.role));
}

// `/submit` is the name in the agents.md contract; `/complete` is the contractor-view name. Same handler.
tasksRouter.post('/:id/complete', requireRole('contractor'), completeTask);
tasksRouter.post('/:id/submit', requireRole('contractor'), completeTask);
