import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  CONTRACTOR_ID,
  SENSITIVE_FIELDS,
  TASK_SUBCATEGORIES,
  TREE_STATUS_FOR_CATEGORY,
  TREE_STATUSES,
} from '../lib/constants.js';
import { execute, nowIso, queryAll, queryOne, withTransaction, type SqlParams } from '../lib/db.js';
import { getUser, HttpError } from '../lib/http.js';
import { sanitizeForRole } from '../lib/sanitize.js';
import { nextTreeCode } from '../lib/treeCode.js';
import { requireRole } from '../middleware/requireRole.js';
import type {
  PlantType,
  Role,
  Species,
  TaskCategory,
  TaskHistoryItem,
  TaskSubcategory,
  TreeDetails,
  TreeListItem,
  TreeStatus,
} from '../types.js';

export const treesRouter = Router();

const PUBLIC_TREE_COLUMNS = [
  'id', 'code', 'type', 'species_id', 'latitude', 'longitude', 'address', 'plot_number',
  'parcel_geometry', 'planting_year', 'is_from_decision', 'decision_number',
  'status', 'contractor_id', 'notes', 'created_by', 'created_at', 'updated_at',
];

const treeSelectSql = (role: Role) => {
  const columns = role === 'official' ? [...PUBLIC_TREE_COLUMNS, ...SENSITIVE_FIELDS] : PUBLIC_TREE_COLUMNS;
  return `
  SELECT ${columns.map((c) => `t.${c}`).join(', ')},
         s.polish_name AS species_polish_name,
         s.latin_name  AS species_latin_name,
         s.cultivar    AS species_cultivar,
         u.full_name   AS contractor_name
    FROM trees t
    JOIN species_dictionary s ON s.id = t.species_id
    LEFT JOIN users u ON u.id = t.contractor_id`;
};

const PLANT_TYPES: readonly PlantType[] = ['tree', 'shrub'];
const TASK_CATEGORIES = Object.keys(TASK_SUBCATEGORIES) as TaskCategory[];

const isPlantType = (v: unknown): v is PlantType => PLANT_TYPES.includes(v as PlantType);
const isTreeStatus = (v: unknown): v is TreeStatus => TREE_STATUSES.includes(v as TreeStatus);
const isTaskCategory = (v: unknown): v is TaskCategory => TASK_CATEGORIES.includes(v as TaskCategory);

function queryString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function parseIntParam(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new HttpError(400, `Parametr "${name}" musi być liczbą całkowitą.`);
  return parsed;
}

function optionalText(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Pole "${name}" musi być tekstem.`);
  return value.trim() === '' ? null : value.trim();
}

function optionalGeometryJson(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      throw new HttpError(400, 'Pole "parcel_geometry" musi być poprawnym JSON-em GeoJSON.');
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  throw new HttpError(400, 'Nieprawidłowy format geometrii działki.');
}

function parseBooleanInt(value: unknown): 0 | 1 {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

function validateContractorId(value: unknown): string | null {
  const id = optionalText(value, 'contractor_id');
  if (!id) return null;
  const contractor = queryOne<{ id: string }>(`SELECT id FROM users WHERE id = :id AND role = 'contractor'`, { id });
  if (!contractor) throw new HttpError(400, 'Wybrany wykonawca nie istnieje.');
  return contractor.id;
}

function requiredNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `Pole "${name}" musi być liczbą z zakresu ${min}–${max}.`);
  }
  return value;
}

/** GET /api/trees?species_id=&planting_year=&status=green,red&type=&contractor_id=&task_category= */
treesRouter.get('/', (req, res) => {
  const user = getUser(req);
  const where: string[] = [];
  const params: SqlParams = {};

  const speciesId = queryString(req.query.species_id);
  if (speciesId) {
    where.push('t.species_id = :speciesId');
    params.speciesId = parseIntParam(speciesId, 'species_id');
  }

  const plantingYear = queryString(req.query.planting_year);
  if (plantingYear) {
    where.push('t.planting_year = :plantingYear');
    params.plantingYear = parseIntParam(plantingYear, 'planting_year');
  }

  const statuses = queryString(req.query.status)?.split(',').map((s) => s.trim()) ?? [];
  if (statuses.length > 0) {
    if (!statuses.every(isTreeStatus)) throw new HttpError(400, 'Nieprawidłowy status rośliny.');
    where.push(`t.status IN (${statuses.map((_, i) => `:status${i}`).join(', ')})`);
    statuses.forEach((s, i) => (params[`status${i}`] = s));
  }

  const type = queryString(req.query.type);
  if (type) {
    if (!isPlantType(type)) throw new HttpError(400, 'Typ musi być "tree" lub "shrub".');
    where.push('t.type = :type');
    params.type = type;
  }

  const contractorId = queryString(req.query.contractor_id);
  if (contractorId) {
    where.push('t.contractor_id = :contractorId');
    params.contractorId = contractorId;
  }

  const address = queryString(req.query.address);
  if (address) {
    where.push("t.address LIKE :address ESCAPE '\\'");
    params.address = `%${address.replace(/[\\%_]/g, '\\$&')}%`;
  }

  const taskCategory = queryString(req.query.task_category);
  if (taskCategory) {
    if (!isTaskCategory(taskCategory)) throw new HttpError(400, 'Nieprawidłowa kategoria zadań.');
    where.push('EXISTS (SELECT 1 FROM tasks k WHERE k.tree_id = t.id AND k.category = :taskCategory)');
    params.taskCategory = taskCategory;
  }

  const sql = `${treeSelectSql(user.role)}
   ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
   ORDER BY t.created_at, t.code`;

  res.json(sanitizeForRole(queryAll<TreeListItem>(sql, params), user.role));
});

treesRouter.get('/next-code', requireRole('official'), (req, res) => {
  const type = req.query.type;
  if (!isPlantType(type)) throw new HttpError(400, 'Parametr "type" musi być "tree" lub "shrub".');
  res.json({ code: nextTreeCode(type) });
});

interface CreateTreeBody {
  type?: unknown;
  species_id?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  address?: unknown;
  plot_number?: unknown;
  parcel_geometry?: unknown;
  planting_year?: unknown;
  is_from_decision?: unknown;
  decision_number?: unknown;
  status?: unknown;
  contractor_id?: unknown;
  assign_planting_task?: unknown;
  contract_number?: unknown;
  contract_scan_url?: unknown;
  funding_source?: unknown;
  notes?: unknown;
}

const MAX_CODE_ATTEMPTS = 5;

treesRouter.post('/', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const body = (req.body ?? {}) as CreateTreeBody;

  if (!isPlantType(body.type)) throw new HttpError(400, 'Pole "type" musi być "tree" lub "shrub".');
  const type = body.type;

  if (typeof body.species_id !== 'number' || !Number.isInteger(body.species_id)) {
    throw new HttpError(400, 'Wybierz gatunek ze słownika.');
  }
  const species = queryOne<Species>('SELECT id, type FROM species_dictionary WHERE id = :id', { id: body.species_id });
  if (!species) throw new HttpError(400, 'Wybrany gatunek nie istnieje w słowniku.');
  if (species.type !== type) {
    throw new HttpError(400, 'Gatunek nie pasuje do typu rośliny (drzewo / krzew).');
  }

  const rawStatus = body.status === undefined ? (body.assign_planting_task ? 'blue' : 'green') : body.status;
  if (!isTreeStatus(rawStatus)) throw new HttpError(400, 'Nieprawidłowy status początkowy.');
  if (rawStatus === 'red') {
    throw new HttpError(400, 'Nowa roślina nie może mieć statusu początkowego "Do wycinki".');
  }
  const shouldCreatePlantingTask = rawStatus === 'blue' || Boolean(body.assign_planting_task);
  const status: TreeStatus = shouldCreatePlantingTask ? 'blue' : rawStatus;

  const plantingYear =
    body.planting_year === undefined || body.planting_year === null || body.planting_year === ''
      ? null
      : requiredNumber(body.planting_year, 'planting_year', 1800, 2100);
  if (plantingYear !== null && !Number.isInteger(plantingYear)) {
    throw new HttpError(400, 'Rok posadzenia musi być liczbą całkowitą.');
  }

  const isFromDecision = parseBooleanInt(body.is_from_decision);
  const decisionNumber = isFromDecision ? optionalText(body.decision_number, 'decision_number') : null;
  const contractorId = validateContractorId(body.contractor_id) ?? (shouldCreatePlantingTask ? CONTRACTOR_ID : null);

  const values = {
    type,
    speciesId: species.id,
    latitude: requiredNumber(body.latitude, 'latitude', -90, 90),
    longitude: requiredNumber(body.longitude, 'longitude', -180, 180),
    address: optionalText(body.address, 'address'),
    plotNumber: optionalText(body.plot_number, 'plot_number'),
    parcelGeometry: optionalGeometryJson(body.parcel_geometry),
    plantingYear,
    isFromDecision,
    decisionNumber,
    status,
    contractorId,
    contractNumber: optionalText(body.contract_number, 'contract_number'),
    contractScanUrl: optionalText(body.contract_scan_url, 'contract_scan_url'),
    fundingSource: optionalText(body.funding_source, 'funding_source'),
    notes: optionalText(body.notes, 'notes'),
    createdBy: user.id,
  };

  const id = randomUUID();
  for (let attempt = 1; ; attempt++) {
    try {
      withTransaction(() => {
        const now = nowIso();
        execute(
          `INSERT INTO trees (id, code, type, species_id, latitude, longitude, address, plot_number, parcel_geometry,
                              planting_year, is_from_decision, decision_number, status, contractor_id,
                              contract_number, contract_scan_url, funding_source, notes, created_by,
                              created_at, updated_at)
           VALUES (:id, :code, :type, :speciesId, :latitude, :longitude, :address, :plotNumber, :parcelGeometry,
                   :plantingYear, :isFromDecision, :decisionNumber, :status, :contractorId,
                   :contractNumber, :contractScanUrl, :fundingSource, :notes, :createdBy, :now, :now)`,
          { ...values, id, code: nextTreeCode(type), now },
        );

        if (shouldCreatePlantingTask) {
          execute(
            `INSERT INTO tasks (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
                                contract_number, contract_scan_url, created_at, updated_at)
             VALUES (:taskId, :treeId, 'nasadzanie', 'posadzenie', 'assigned', :assignedTo, :createdBy, :description,
                     :contractNumber, :contractScanUrl, :now, :now)`,
            {
              taskId: randomUUID(),
              treeId: id,
              assignedTo: contractorId ?? CONTRACTOR_ID,
              createdBy: user.id,
              description:
                values.notes ?? 'Posadzenie nowej rośliny w terenie wraz z palikowaniem i zabezpieczeniem misy korzeniowej.',
              contractNumber: values.contractNumber ?? values.decisionNumber ?? 'NASADZENIE-NOWE',
              contractScanUrl: values.contractScanUrl,
              now,
            },
          );
        }
      });
      break;
    } catch (error) {
      const isCodeCollision = error instanceof Error && /UNIQUE constraint failed: trees\.code/.test(error.message);
      if (!isCodeCollision || attempt >= MAX_CODE_ATTEMPTS) throw error;
    }
  }

  const created = queryOne<TreeListItem>(`${treeSelectSql(user.role)} WHERE t.id = :id`, { id });
  res.status(201).json(sanitizeForRole(created, user.role));
});

/**
 * POST /api/trees/warranty-tasks — masowe generowanie pakietu zadań kontroli gwarancyjnej (po 3 latach)
 * dla drzew posadzonych z decyzji administracyjnych.
 */
treesRouter.post('/warranty-tasks', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const body = (req.body ?? {}) as { tree_ids?: unknown };
  const currentYear = new Date().getFullYear();

  let targetTrees: TreeListItem[];
  if (Array.isArray(body.tree_ids) && body.tree_ids.length > 0) {
    const ids = body.tree_ids.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (ids.length === 0) throw new HttpError(400, 'Podaj poprawne identyfikatory drzew.');
    const params: SqlParams = {};
    const placeholders = ids.map((id, idx) => {
      params[`id${idx}`] = id;
      return `:id${idx}`;
    });
    targetTrees = queryAll<TreeListItem>(
      `${treeSelectSql(user.role)} WHERE t.id IN (${placeholders.join(', ')})`,
      params,
    );
  } else {
    targetTrees = queryAll<TreeListItem>(
      `${treeSelectSql(user.role)} WHERE t.is_from_decision = 1 AND t.planting_year = :targetYear`,
      { targetYear: currentYear - 3 },
    );
  }

  if (targetTrees.length === 0) {
    throw new HttpError(400, 'Brak drzew z decyzji administracyjnej wymagających kontroli gwarancyjnej.');
  }

  const taskIds: string[] = [];
  withTransaction(() => {
    const now = nowIso();
    for (const tree of targetTrees) {
      const assignedTo = tree.contractor_id ?? CONTRACTOR_ID;
      const taskId = randomUUID();
      taskIds.push(taskId);
      const decisionLabel = tree.decision_number ? ` (decyzja ${tree.decision_number})` : '';

      execute(
        `UPDATE trees SET status = 'yellow', contractor_id = :contractorId, updated_at = :now WHERE id = :treeId`,
        { contractorId: assignedTo, now, treeId: tree.id },
      );

      execute(
        `INSERT INTO tasks (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
                            contract_number, contract_scan_url, created_at, updated_at)
         VALUES (:id, :treeId, 'pielegnacja', 'przycinanie', 'assigned', :assignedTo, :createdBy, :description,
                 :contractNumber, :contractScanUrl, :now, :now)`,
        {
          id: taskId,
          treeId: tree.id,
          assignedTo,
          createdBy: user.id,
          description: `Kontrola gwarancyjna po 3 latach od posadzenia${decisionLabel} — weryfikacja przeżywalności, stanu korony oraz cięcie pielęgnacyjne.`,
          contractNumber: tree.contract_number ?? tree.decision_number ?? 'GWARANCJA-3L',
          contractScanUrl: tree.contract_scan_url ?? null,
          now,
        },
      );
    }
  });

  res.status(201).json({
    created_count: taskIds.length,
    task_ids: taskIds,
  });
});

const PUBLIC_TASK_COLUMNS = [
  'id', 'tree_id', 'category', 'subcategory', 'status', 'assigned_to', 'created_by', 'description',
  'contractor_comment', 'contractor_photo_url', 'completed_at', 'official_rejection_reason',
  'reviewed_by', 'reviewed_at', 'locked_by', 'locked_at', 'created_at', 'updated_at',
];
const SENSITIVE_TASK_COLUMNS = ['contract_number', 'contract_scan_url'];

const taskHistorySql = (role: Role) => {
  const columns = role === 'official' ? [...PUBLIC_TASK_COLUMNS, ...SENSITIVE_TASK_COLUMNS] : PUBLIC_TASK_COLUMNS;
  return `
  SELECT ${columns.map((c) => `k.${c}`).join(', ')},
         ua.full_name AS assigned_to_name,
         uc.full_name AS created_by_name,
         ur.full_name AS reviewed_by_name,
         ul.full_name AS locked_by_name
    FROM tasks k
    LEFT JOIN users ua ON ua.id = k.assigned_to
    LEFT JOIN users uc ON uc.id = k.created_by
    LEFT JOIN users ur ON ur.id = k.reviewed_by
    LEFT JOIN users ul ON ul.id = k.locked_by
   WHERE k.tree_id = :treeId
   ORDER BY k.created_at DESC, k.id`;
};

function loadTreeDetails(id: string, role: Role): TreeDetails {
  const tree = queryOne<TreeListItem>(`${treeSelectSql(role)} WHERE t.id = :id`, { id });
  if (!tree) throw new HttpError(404, 'Nie znaleziono rośliny.');
  const tasks = queryAll<TaskHistoryItem>(taskHistorySql(role), { treeId: id });
  return sanitizeForRole({ ...tree, tasks }, role);
}

/** GET /api/trees/:id — karta ewidencyjna z pełną historią prac. */
treesRouter.get('/:id', (req, res) => {
  const user = getUser(req);
  res.json(loadTreeDetails(req.params.id, user.role));
});

interface UpdateTreeBody {
  latitude?: unknown;
  longitude?: unknown;
  address?: unknown;
  plot_number?: unknown;
  parcel_geometry?: unknown;
  planting_year?: unknown;
  is_from_decision?: unknown;
  decision_number?: unknown;
  contractor_id?: unknown;
  status?: unknown;
  notes?: unknown;
  contract_number?: unknown;
  contract_scan_url?: unknown;
  funding_source?: unknown;
}

/** PATCH /api/trees/:id — edycja lokalizacji, działki, wykonawcy i parametrów drzewa. */
treesRouter.patch('/:id', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const treeId = String(req.params.id);
  const body = (req.body ?? {}) as UpdateTreeBody;

  const existing = queryOne<{ id: string }>('SELECT id FROM trees WHERE id = :id', { id: treeId });
  if (!existing) throw new HttpError(404, 'Nie znaleziono rośliny.');

  const sets: string[] = [];
  const params: SqlParams = { id: treeId };

  if (body.latitude !== undefined) {
    sets.push('latitude = :latitude');
    params.latitude = requiredNumber(body.latitude, 'latitude', -90, 90);
  }
  if (body.longitude !== undefined) {
    sets.push('longitude = :longitude');
    params.longitude = requiredNumber(body.longitude, 'longitude', -180, 180);
  }
  if (body.address !== undefined) {
    sets.push('address = :address');
    params.address = optionalText(body.address, 'address');
  }
  if (body.plot_number !== undefined) {
    sets.push('plot_number = :plotNumber');
    params.plotNumber = optionalText(body.plot_number, 'plot_number');
  }
  if (body.parcel_geometry !== undefined) {
    sets.push('parcel_geometry = :parcelGeometry');
    params.parcelGeometry = optionalGeometryJson(body.parcel_geometry);
  }
  if (body.planting_year !== undefined) {
    const year =
      body.planting_year === null || body.planting_year === ''
        ? null
        : requiredNumber(body.planting_year, 'planting_year', 1800, 2100);
    if (year !== null && !Number.isInteger(year)) {
      throw new HttpError(400, 'Rok posadzenia musi być liczbą całkowitą.');
    }
    sets.push('planting_year = :plantingYear');
    params.plantingYear = year;
  }
  if (body.is_from_decision !== undefined) {
    sets.push('is_from_decision = :isFromDecision');
    params.isFromDecision = parseBooleanInt(body.is_from_decision);
  }
  if (body.decision_number !== undefined) {
    sets.push('decision_number = :decisionNumber');
    params.decisionNumber = optionalText(body.decision_number, 'decision_number');
  }
  let updatedContractorId: string | null | undefined;
  if (body.contractor_id !== undefined) {
    updatedContractorId = validateContractorId(body.contractor_id);
    sets.push('contractor_id = :contractorId');
    params.contractorId = updatedContractorId;
  }
  if (body.status !== undefined) {
    if (!isTreeStatus(body.status)) throw new HttpError(400, 'Nieprawidłowy status rośliny.');
    sets.push('status = :status');
    params.status = body.status;
  }
  if (body.notes !== undefined) {
    sets.push('notes = :notes');
    params.notes = optionalText(body.notes, 'notes');
  }
  if (body.contract_number !== undefined) {
    sets.push('contract_number = :contractNumber');
    params.contractNumber = optionalText(body.contract_number, 'contract_number');
  }
  if (body.contract_scan_url !== undefined) {
    sets.push('contract_scan_url = :contractScanUrl');
    params.contractScanUrl = optionalText(body.contract_scan_url, 'contract_scan_url');
  }
  if (body.funding_source !== undefined) {
    sets.push('funding_source = :fundingSource');
    params.fundingSource = optionalText(body.funding_source, 'funding_source');
  }

  if (sets.length === 0) {
    throw new HttpError(400, 'Brak pól do aktualizacji.');
  }

  withTransaction(() => {
    const now = nowIso();
    params.now = now;
    sets.push('updated_at = :now');
    execute(`UPDATE trees SET ${sets.join(', ')} WHERE id = :id`, params);

    if (updatedContractorId !== undefined) {
      execute(
        `UPDATE tasks SET assigned_to = :contractorId, updated_at = :now
          WHERE tree_id = :id AND status IN ('assigned', 'rejected')`,
        { contractorId: updatedContractorId, now, id: treeId },
      );
    }
  });

  res.json(loadTreeDetails(treeId, user.role));
});

/** DELETE /api/trees/:id — usunięcie rośliny wraz z powiązanymi zadaniami (ON DELETE CASCADE). */
treesRouter.delete('/:id', requireRole('official'), (req, res) => {
  const treeId = String(req.params.id);
  const result = execute('DELETE FROM trees WHERE id = :id', { id: treeId });
  if (result.changes === 0) throw new HttpError(404, 'Nie znaleziono rośliny.');
  res.json({ deleted: true, id: treeId });
});

interface CreateTaskBody {
  category?: unknown;
  subcategory?: unknown;
  contract_number?: unknown;
  contract_scan_url?: unknown;
  description?: unknown;
}

/** POST /api/trees/:id/tasks — zlecenie zadania; przypisuje wykonawcę i zmienia kolor rośliny. */
treesRouter.post('/:id/tasks', requireRole('official'), (req, res) => {
  const user = getUser(req);
  const treeId = String(req.params.id);
  const body = (req.body ?? {}) as CreateTaskBody;

  if (!isTaskCategory(body.category)) throw new HttpError(400, 'Wybierz kategorię zadania.');
  const category = body.category;
  if (!TASK_SUBCATEGORIES[category].includes(body.subcategory as TaskSubcategory)) {
    throw new HttpError(400, 'Podkategoria nie pasuje do wybranej kategorii.');
  }
  const subcategory = body.subcategory as TaskSubcategory;

  const contractNumber = optionalText(body.contract_number, 'contract_number');
  if (!contractNumber) throw new HttpError(400, 'Podaj numer umowy.');

  const existingTree = queryOne<{ contractor_id: string | null }>(
    'SELECT contractor_id FROM trees WHERE id = :id',
    { id: treeId },
  );
  if (!existingTree) throw new HttpError(404, 'Nie znaleziono rośliny.');
  const assignedContractorId = existingTree.contractor_id ?? CONTRACTOR_ID;

  const values = {
    id: randomUUID(),
    treeId,
    category,
    subcategory,
    assignedTo: assignedContractorId,
    createdBy: user.id,
    description: optionalText(body.description, 'description'),
    contractNumber,
    contractScanUrl: optionalText(body.contract_scan_url, 'contract_scan_url'),
  };

  withTransaction(() => {
    const now = nowIso();
    const updated = execute(
      `UPDATE trees SET status = :status, contractor_id = :contractorId, updated_at = :now WHERE id = :treeId`,
      { status: TREE_STATUS_FOR_CATEGORY[category], contractorId: assignedContractorId, now, treeId },
    );
    if (updated.changes === 0) throw new HttpError(404, 'Nie znaleziono rośliny.');
    execute(
      `INSERT INTO tasks (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
                          contract_number, contract_scan_url, created_at, updated_at)
       VALUES (:id, :treeId, :category, :subcategory, 'assigned', :assignedTo, :createdBy, :description,
               :contractNumber, :contractScanUrl, :now, :now)`,
      { ...values, now },
    );
  });

  res.status(201).json(loadTreeDetails(treeId, user.role));
});
