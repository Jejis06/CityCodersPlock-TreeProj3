import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { execute, nowIso, queryAll, queryOne, withTransaction, type SqlParams } from '../lib/db.js';
import { HttpError, getUser } from '../lib/http.js';
import {
  CONTRACTOR_ID,
  LOCK_TIMEOUT_MINUTES,
  TASK_NEWEST_FIRST_ORDER,
  TASK_SUBCATEGORIES,
  TREE_STATUS_FOR_CATEGORY,
} from '../lib/constants.js';
import { sanitizeForRole } from '../lib/sanitize.js';
import { requireRole } from '../middleware/requireRole.js';
import type { Role, Task, TaskCategory, TaskStatus, TaskSubcategory } from '../types.js';

export const tasksRouter = Router();

const TASK_STATUSES: readonly TaskStatus[] = ['assigned', 'pending_approval', 'approved', 'rejected'];
const TASK_CATEGORIES = Object.keys(TASK_SUBCATEGORIES) as TaskCategory[];
const isTaskCategory = (v: unknown): v is TaskCategory => TASK_CATEGORIES.includes(v as TaskCategory);

function optionalTrimmedText(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Pole "${fieldName}" musi być tekstem.`);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Task joined with tree/species data needed by the map and cards. */
const TASK_LIST_SQL = `
  SELECT k.*,
         t.code        AS tree_code,
         t.type        AS tree_type,
         t.latitude    AS tree_latitude,
         t.longitude   AS tree_longitude,
         t.address     AS tree_address,
         t.plot_number AS tree_plot_number,
         t.status      AS tree_status,
         s.polish_name AS species_polish_name,
         s.latin_name  AS species_latin_name,
         s.cultivar    AS species_cultivar,
         lu.full_name  AS locked_by_name,
         ru.full_name  AS reviewed_by_name
    FROM tasks k
    JOIN trees t ON t.id = k.tree_id
    JOIN species_dictionary s ON s.id = t.species_id
    LEFT JOIN users lu ON lu.id = k.locked_by
    LEFT JOIN users ru ON ru.id = k.reviewed_by`;

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
  const sql = `${TASK_LIST_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${TASK_NEWEST_FIRST_ORDER}`;
  res.json(queryAll<Task>(sql, params).map((row) => forRole(row, user.role)));
});

interface BulkCreateTasksBody {
  tree_ids?: unknown;
  category?: unknown;
  subcategory?: unknown;
  contractor_id?: unknown;
  assigned_to?: unknown;
  contract_number?: unknown;
  contract_scan_url?: unknown;
  description?: unknown;
}

/**
 * POST /api/tasks/bulk — masowe zlecenie wspólnego zadania dla zaznaczonych na mapie roślin (`tree_ids`).
 * W jednej transakcji tworzy zadania `assigned` dla wybranego wykonawcy (domyślnie Jan Zieliński)
 * i zmienia status wszystkich zaznaczonych roślin wg kategorii zadania.
 */
tasksRouter.post('/bulk', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const body = (req.body ?? {}) as BulkCreateTasksBody;

  if (!Array.isArray(body.tree_ids)) {
    throw new HttpError(400, 'Pole "tree_ids" musi być tablicą identyfikatorów roślin.');
  }
  const treeIds = [
    ...new Set(body.tree_ids.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())),
  ];
  if (treeIds.length === 0) {
    throw new HttpError(400, 'Wybierz co najmniej jedną roślinę do zlecenia zadania.');
  }

  if (!isTaskCategory(body.category)) {
    throw new HttpError(400, 'Wybierz kategorię zadania.');
  }
  const category = body.category;
  if (!TASK_SUBCATEGORIES[category].includes(body.subcategory as TaskSubcategory)) {
    throw new HttpError(400, 'Podkategoria nie pasuje do wybranej kategorii.');
  }
  const subcategory = body.subcategory as TaskSubcategory;

  const rawContractorId = optionalTrimmedText(body.contractor_id ?? body.assigned_to, 'contractor_id');
  let assignedContractorId = CONTRACTOR_ID;
  if (rawContractorId) {
    const contractor = queryOne<{ id: string }>(
      `SELECT id FROM users WHERE id = :id AND role = 'contractor'`,
      { id: rawContractorId },
    );
    if (!contractor) throw new HttpError(400, 'Wybrany wykonawca nie istnieje.');
    assignedContractorId = contractor.id;
  }

  const contractNumber = optionalTrimmedText(body.contract_number, 'contract_number');
  const contractScanUrl = optionalTrimmedText(body.contract_scan_url, 'contract_scan_url');
  const description = optionalTrimmedText(body.description, 'description');

  const treeQueryParams: SqlParams = {};
  const placeholders = treeIds.map((id, idx) => {
    treeQueryParams[`id${idx}`] = id;
    return `:id${idx}`;
  });

  const existingTrees = queryAll<{
    id: string;
    contract_number: string | null;
    contract_scan_url: string | null;
  }>(
    `SELECT id, contract_number, contract_scan_url FROM trees WHERE id IN (${placeholders.join(', ')})`,
    treeQueryParams,
  );
  if (existingTrees.length === 0) {
    throw new HttpError(404, 'Nie znaleziono żadnej z zaznaczonych roślin.');
  }

  const nextTreeStatus = TREE_STATUS_FOR_CATEGORY[category];
  const createdTaskIds: string[] = [];

  const createdTasks = withTransaction(() => {
    const now = nowIso();
    for (const tree of existingTrees) {
      const taskId = randomUUID();
      createdTaskIds.push(taskId);

      execute(
        `UPDATE trees
            SET status = :status, contractor_id = :contractorId, updated_at = :now
          WHERE id = :treeId`,
        {
          status: nextTreeStatus,
          contractorId: assignedContractorId,
          now,
          treeId: tree.id,
        },
      );

      execute(
        `INSERT INTO tasks (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
                            contract_number, contract_scan_url, created_at, updated_at)
         VALUES (:id, :treeId, :category, :subcategory, 'assigned', :assignedTo, :createdBy, :description,
                 :contractNumber, :contractScanUrl, :now, :now)`,
        {
          id: taskId,
          treeId: tree.id,
          category,
          subcategory,
          assignedTo: assignedContractorId,
          createdBy: user.id,
          description,
          contractNumber: contractNumber ?? tree.contract_number ?? 'UM/ZZ/2026/GRUPOWE',
          contractScanUrl: contractScanUrl ?? tree.contract_scan_url ?? null,
          now,
        },
      );
    }

    const taskParams: SqlParams = {};
    const taskPlaceholders = createdTaskIds.map((id, idx) => {
      taskParams[`tid${idx}`] = id;
      return `:tid${idx}`;
    });
    return queryAll<Task>(
      `${TASK_LIST_SQL} WHERE k.id IN (${taskPlaceholders.join(', ')}) ORDER BY ${TASK_NEWEST_FIRST_ORDER}`,
      taskParams,
    );
  });

  res.status(201).json({
    created_count: createdTasks.length,
    task_ids: createdTaskIds,
    tree_ids: existingTrees.map((t) => t.id),
    status: nextTreeStatus,
    tasks: createdTasks.map((row) => forRole(row, user.role)),
  });
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

// ---------------------------------------------------------------------------
// MUTEX + decyzje urzędnika (kolejka zatwierdzeń)
// ---------------------------------------------------------------------------

const lockExpiredBefore = (): string => new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60_000).toISOString();

function loadTask(taskId: string): Task {
  const task = queryOne<Task>(`${TASK_LIST_SQL} WHERE k.id = :id`, { id: taskId });
  if (!task) throw new HttpError(404, 'Nie znaleziono zadania.');
  return task;
}

/** Wymaga, by zadanie czekało na zatwierdzenie i miało ważną blokadę bieżącego użytkownika. */
function assertOwnsLock(taskId: string, userId: string): Task {
  const task = loadTask(taskId);
  if (task.status !== 'pending_approval') throw new HttpError(409, 'Zadanie nie oczekuje na zatwierdzenie.');
  const lockedByMe = task.locked_by === userId;
  const lockValid = task.locked_at !== null && task.locked_at >= lockExpiredBefore();
  if (!lockedByMe || !lockValid) {
    throw new HttpError(409, 'Nie posiadasz ważnej blokady tego zadania. Otwórz je ponownie.', {
      locked_by_name: (task as Task & { locked_by_name?: string | null }).locked_by_name ?? null,
    });
  }
  return task;
}

tasksRouter.post('/:id/lock', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const taskId = String(req.params.id);
  // Jedno atomowe, warunkowe UPDATE — bez wyścigu SELECT→UPDATE.
  const won = queryOne<{ id: string }>(
    `UPDATE tasks SET locked_by = :userId, locked_at = :now
      WHERE id = :taskId AND status = 'pending_approval'
        AND (locked_by IS NULL OR locked_by = :userId OR locked_at < :expiredBefore)
      RETURNING id`,
    { userId: user.id, taskId, now: nowIso(), expiredBefore: lockExpiredBefore() },
  );
  const task = loadTask(taskId);
  if (!won) {
    if (task.status !== 'pending_approval') throw new HttpError(409, 'Zadanie nie oczekuje na zatwierdzenie.');
    const holder = (task as Task & { locked_by_name?: string | null }).locked_by_name ?? 'inny urzędnik';
    throw new HttpError(409, `Zadanie jest w trakcie weryfikacji przez: ${holder}`, {
      locked_by: task.locked_by,
      locked_by_name: holder,
    });
  }
  res.json(forRole(task, user.role));
});

tasksRouter.post('/:id/unlock', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const taskId = String(req.params.id);
  // Zwalniamy wyłącznie własną blokadę (idempotentnie).
  execute('UPDATE tasks SET locked_by = NULL, locked_at = NULL WHERE id = :taskId AND locked_by = :userId', {
    taskId,
    userId: user.id,
  });
  res.json(forRole(loadTask(taskId), user.role));
});

tasksRouter.post('/:id/approve', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const taskId = String(req.params.id);
  const task = withTransaction(() => {
    const current = assertOwnsLock(taskId, user.id);
    const now = nowIso();
    execute(
      `UPDATE tasks SET status = 'approved', reviewed_by = :userId, reviewed_at = :now,
              locked_by = NULL, locked_at = NULL
        WHERE id = :taskId`,
      { userId: user.id, now, taskId },
    );
    execute("UPDATE trees SET status = 'green' WHERE id = :treeId", { treeId: current.tree_id });
    return loadTask(taskId);
  });
  res.json(forRole(task, user.role));
});

tasksRouter.post('/:id/reject', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const taskId = String(req.params.id);
  const body = (req.body ?? {}) as { reason?: unknown; official_rejection_reason?: unknown };
  const rawReason = body.reason ?? body.official_rejection_reason;
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (!reason) throw new HttpError(400, 'Powód odrzucenia jest wymagany.');

  const task = withTransaction(() => {
    const current = assertOwnsLock(taskId, user.id);
    execute(
      `UPDATE tasks SET status = 'rejected', official_rejection_reason = :reason,
              reviewed_by = :userId, reviewed_at = :now, locked_by = NULL, locked_at = NULL
        WHERE id = :taskId`,
      { reason, userId: user.id, now: nowIso(), taskId },
    );
    execute('UPDATE trees SET status = :status WHERE id = :treeId', {
      status: TREE_STATUS_FOR_CATEGORY[current.category],
      treeId: current.tree_id,
    });
    return loadTask(taskId);
  });
  res.json(forRole(task, user.role));
});
