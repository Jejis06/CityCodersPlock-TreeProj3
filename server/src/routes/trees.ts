import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { SENSITIVE_FIELDS, TASK_SUBCATEGORIES, TREE_STATUSES } from '../lib/constants.js';
import { execute, nowIso, queryAll, queryOne, withTransaction, type SqlParams } from '../lib/db.js';
import { getUser, HttpError } from '../lib/http.js';
import { sanitizeForRole } from '../lib/sanitize.js';
import { nextTreeCode } from '../lib/treeCode.js';
import { requireRole } from '../middleware/requireRole.js';
import type { PlantType, Role, Species, TaskCategory, TreeListItem, TreeStatus } from '../types.js';

export const treesRouter = Router();

const PUBLIC_TREE_COLUMNS = [
  'id', 'code', 'type', 'species_id', 'latitude', 'longitude', 'address', 'plot_number',
  'planting_year', 'status', 'contractor_id', 'notes', 'created_by', 'created_at', 'updated_at',
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
  planting_year?: unknown;
  status?: unknown;
  contract_number?: unknown;
  contract_scan_url?: unknown;
  funding_source?: unknown;
  notes?: unknown;
}

function optionalText(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `Pole "${name}" musi być tekstem.`);
  return value.trim() === '' ? null : value.trim();
}

function requiredNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `Pole "${name}" musi być liczbą z zakresu ${min}–${max}.`);
  }
  return value;
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

  const status = body.status === undefined ? 'green' : body.status;
  if (!isTreeStatus(status)) throw new HttpError(400, 'Nieprawidłowy status początkowy.');

  const plantingYear =
    body.planting_year === undefined || body.planting_year === null
      ? null
      : requiredNumber(body.planting_year, 'planting_year', 1800, 2100);
  if (plantingYear !== null && !Number.isInteger(plantingYear)) {
    throw new HttpError(400, 'Rok posadzenia musi być liczbą całkowitą.');
  }

  const values = {
    type,
    speciesId: species.id,
    latitude: requiredNumber(body.latitude, 'latitude', -90, 90),
    longitude: requiredNumber(body.longitude, 'longitude', -180, 180),
    address: optionalText(body.address, 'address'),
    plotNumber: optionalText(body.plot_number, 'plot_number'),
    plantingYear,
    status,
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
          `INSERT INTO trees (id, code, type, species_id, latitude, longitude, address, plot_number, planting_year,
                              status, contract_number, contract_scan_url, funding_source, notes, created_by,
                              created_at, updated_at)
           VALUES (:id, :code, :type, :speciesId, :latitude, :longitude, :address, :plotNumber, :plantingYear,
                   :status, :contractNumber, :contractScanUrl, :fundingSource, :notes, :createdBy, :now, :now)`,
          { ...values, id, code: nextTreeCode(type), now },
        );
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
