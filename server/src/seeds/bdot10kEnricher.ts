import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../lib/config.js';
import { CONTRACTOR_ID, SECOND_CONTRACTOR_ID } from '../lib/constants.js';
import { execute, nowIso, queryAll, queryOne, withTransaction } from '../lib/db.js';
import { codePrefix } from '../lib/treeCode.js';
import { reverseGeocodePoint } from '../routes/geocode.js';
import type { PlantType, TaskCategory, TaskStatus, TaskSubcategory, TreeStatus } from '../types.js';
import { isForcedGreenTree, isRemovedTree } from './databaseFixes.js';

/**
 * BDOT10k seeder: real tree locations for Płock (TERYT 1462, KML `drzewa_dbdot10k`)
 * + deterministic enrichment with the business columns BDOT10k does not have
 * (species, codes, planting year, decisions, contracts, funding, addresses, statuses, tasks).
 */

export const BDOT10K_TERYT = '1462';
export const BDOT10K_MIN_TREES = 40;
export const BDOT10K_TREE_ID_PREFIX = 'bd010000-1462-4000-8000-';
const BDOT10K_TASK_ID_PREFIX = 'bd01aaaa-1462-4000-8000-';

const OFFICIAL_IDS = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'] as const;
const RANDOM_SEED = 1462_2026;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// ---------------------------------------------------------------------------
// 1. KML parsing
// ---------------------------------------------------------------------------

export interface KmlPoint {
  name: string | null;
  latitude: number;
  longitude: number;
}

export interface GeocodedPointCacheEntry {
  address: string | null;
  plot_number: string | null;
  precinct: string | null;
  parcel_geometry: string | null;
}

export const coordKey = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

export function loadBdot10kGeocoded(
  filePath: string = config.bdot10kGeocodedPath,
): Record<string, GeocodedPointCacheEntry> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, GeocodedPointCacheEntry>;
  } catch {
    return {};
  }
}

/** Reads `<Placemark><Point><coordinates>lng,lat[,alt]</coordinates>` (KML order: longitude first). */
export function parseKmlPoints(kml: string): KmlPoint[] {
  const points: KmlPoint[] = [];
  const seen = new Set<string>();

  for (const match of kml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)) {
    const body = match[1] ?? '';
    const coordinates = /<Point\b[^>]*>[\s\S]*?<coordinates>([^<]+)<\/coordinates>/i.exec(body)?.[1];
    const firstTuple = coordinates?.trim().split(/\s+/)[0];
    if (!firstTuple) continue;

    const [lngRaw, latRaw] = firstTuple.split(',');
    const longitude = Number(lngRaw);
    const latitude = Number(latRaw);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;

    const key = coordKey(latitude, longitude);
    if (seen.has(key)) continue;
    seen.add(key);

    const name = /<name>\s*([^<]*?)\s*<\/name>/i.exec(body)?.[1] || null;
    points.push({ name, latitude, longitude });
  }
  return points;
}

export function loadBdot10kPoints(filePath: string = config.bdot10kKmlPath): KmlPoint[] {
  return parseKmlPoints(readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// 2. Deterministic randomness
// ---------------------------------------------------------------------------

type Random = () => number;

function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: Random, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('pick() on an empty list');
  return item;
}

const between = (rand: Random, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function shuffle<T>(rand: Random, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

/** Exact split of `total` items by shares (largest remainder), e.g. 65 × 70/12/10/8 % → 46/8/6/5. */
function quota<K extends string>(total: number, shares: Record<K, number>): K[] {
  const keys = Object.keys(shares) as K[];
  const exact = keys.map((key) => ({ key, value: total * shares[key] }));
  const counts = new Map(exact.map(({ key, value }) => [key, Math.floor(value)]));
  let missing = total - [...counts.values()].reduce((sum, n) => sum + n, 0);
  for (const { key } of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (missing-- <= 0) break;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.flatMap((key) => Array<K>(counts.get(key) ?? 0).fill(key));
}

// ---------------------------------------------------------------------------
// 3. Enrichment dictionaries (simulation data for the jury demo)
// ---------------------------------------------------------------------------

/**
 * All 70 tree species (`1..70`) and 30 shrub species (`71..100`) from `species_dictionary`,
 * ordered with distinct `polish_name` genera first so every seeded plant gets a unique species.
 */
export const TREE_SPECIES_IDS = [
  1, 12, 19, 24, 28, 31, 34, 37, 39, 41, 43, 47, 49, 52, 53, 55, 56, 58, 59, 60, 61, 62, 63, 65, 67, 68,
  69, 70, 5, 15, 21, 26, 36, 40, 45, 48, 51, 57, 64, 66, 7, 16, 22, 27, 46, 8, 17, 23, 9, 18, 10, 11,
  2, 3, 4, 6, 13, 14, 20, 25, 29, 30, 32, 33, 35, 38, 42, 44, 50, 54,
] as const;

export const SHRUB_SPECIES_IDS = [
  71, 73, 74, 76, 77, 79, 81, 83, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  72, 75, 78, 80, 82, 84,
] as const;

interface District {
  name: string;
  precinct: string;
  streets: readonly string[];
  matches: (lat: number, lng: number) => boolean;
}

/** First match wins — rough bounding rules for Płock districts covered by the KML points. */
const DISTRICTS: readonly District[] = [
  { name: 'Radziwie', precinct: '0012', streets: ['ul. Kolejowa', 'ul. Portowa', 'ul. Zielona'], matches: (lat, lng) => lat < 52.537 && lng < 19.7 },
  { name: 'Góry', precinct: '0014', streets: ['ul. Góry', 'ul. Okrzei'], matches: (lat, lng) => lat < 52.54 && lng < 19.74 },
  { name: 'Podolszyce', precinct: '0021', streets: ['al. Armii Krajowej', 'ul. Wyszogrodzka', 'ul. Walecznych'], matches: (lat, lng) => lng >= 19.74 && lat < 52.5455 },
  { name: 'Borowiczki', precinct: '0024', streets: ['ul. Wyszogrodzka', 'ul. Harcerska'], matches: (lat, lng) => lng >= 19.755 },
  { name: 'Międzytorze', precinct: '0018', streets: ['ul. Kutrzeby', 'ul. Otolińska'], matches: (lat, lng) => lng >= 19.725 && lat >= 52.55 },
  { name: 'Łukasiewicza', precinct: '0017', streets: ['ul. Łukasiewicza', 'ul. Kossaka'], matches: (_lat, lng) => lng >= 19.725 },
  { name: 'Śródmieście', precinct: '0005', streets: ['al. Piłsudskiego', 'ul. Kilińskiego'], matches: (lat, lng) => lng >= 19.7 && lat >= 52.548 },
  { name: 'Śródmieście', precinct: '0004', streets: ['ul. Kazimierza Wielkiego', 'ul. Sienkiewicza'], matches: (lat, lng) => lng >= 19.695 && lat < 52.548 },
  { name: 'Śródmieście', precinct: '0003', streets: ['al. Jachowicza', 'ul. Kolegialna'], matches: (lat, lng) => lng >= 19.688 && lat >= 52.549 },
  { name: 'Stare Miasto', precinct: '0002', streets: ['ul. Bielska', 'ul. Kwiatka'], matches: (lat) => lat >= 52.552 },
  { name: 'Stare Miasto', precinct: '0001', streets: ['ul. Tumska', 'Stary Rynek', 'ul. Grodzka'], matches: () => true },
];

/** Contracts by year: open orders (2026), planting (2025), maintenance (2024), warranty (2023). */
const CONTRACTS = {
  ziel: { number: 'UM/ZIEL/12/2026', scan: '/demo/contracts/UM-ZZ-2026-011.pdf' },
  nas: { number: 'UM/NAS/08/2025', scan: '/demo/contracts/UM-ZZ-2026-014.pdf' },
  utr: { number: 'UM/UTR/03/2024', scan: '/demo/contracts/UM-ZZ-2026-021.pdf' },
  gwar: { number: 'UM/GWAR/19/2023', scan: '/demo/contracts/UM-ZZ-2026-030.pdf' },
} as const;
type Contract = (typeof CONTRACTS)[keyof typeof CONTRACTS];

const contractForYear = (year: number | null): Contract =>
  year === 2026 ? CONTRACTS.ziel : year === 2025 ? CONTRACTS.nas : year === 2023 ? CONTRACTS.gwar : CONTRACTS.utr;

const CONTRACT_FOR_CATEGORY: Record<TaskCategory, Contract> = {
  pielegnacja: CONTRACTS.utr,
  wycinka: CONTRACTS.ziel,
  nasadzanie: CONTRACTS.nas,
};

const FUNDING_SOURCES = [
  'Budżet Obywatelski Płock',
  'Program Zielony Płock - ORLEN',
  'Fundusz Ochrony Środowiska',
  'Środki bieżące Gminy Płock',
] as const;

const DECISION_INITIALS = ['AK', 'PN', 'MW', 'JS'] as const;

const PHOTO_FOR_SUBCATEGORY: Record<TaskSubcategory, string> = {
  nawozenie: '/demo/photos/fertilizing.svg',
  podlewanie: '/demo/photos/watering.svg',
  przycinanie: '/demo/photos/pruning.svg',
  wycinka: '/demo/photos/cutting.svg',
  posadzenie: '/demo/photos/planting.svg',
  korowanie: '/demo/photos/planting.svg',
  palikowanie: '/demo/photos/planting.svg',
};

const TASK_DESCRIPTIONS: Record<TaskSubcategory, readonly string[]> = {
  nawozenie: ['Nawożenie mikoryzowe w strefie korzeniowej.', 'Nawożenie wolnodziałające NPK, iniekcja doglebowa.'],
  podlewanie: ['Podlewanie interwencyjne 80 l, okres suszy.', 'Podlewanie 100 l z odnowieniem misy.'],
  przycinanie: ['Cięcie sanitarne korony, usunięcie suchych gałęzi.', 'Cięcie formujące i podniesienie korony nad chodnikiem.'],
  wycinka: ['Wycinka wraz z frezowaniem pnia i uprzątnięciem terenu.', 'Usunięcie rośliny zagrażającej bezpieczeństwu, frezowanie karpy.'],
  posadzenie: ['Posadzenie rośliny z bryłą korzeniową, zaprawienie dołu ziemią urodzajną.', 'Nasadzenie nowej rośliny wraz z wykonaniem misy.'],
  korowanie: ['Ściółkowanie misy korą sosnową (warstwa 7 cm).', 'Uzupełnienie kory w misie i odchwaszczenie.'],
  palikowanie: ['Palikowanie trójnogiem z taśmą mocującą.', 'Wymiana palików i poprawa wiązań.'],
};

const CONTRACTOR_COMMENTS: Record<TaskSubcategory, readonly string[]> = {
  nawozenie: ['Nawóz podany w 8 punktach wokół pnia.', 'Nawożenie wykonane, gleba spulchniona.'],
  podlewanie: ['Podlano 100 l wody, misa odnowiona.', 'Podlewanie wykonane wieczorem, woda wsiąkła.'],
  przycinanie: ['Usunięto suche konary, rany zabezpieczone.', 'Korona podniesiona do 2,5 m nad chodnikiem.'],
  wycinka: ['Drzewo usunięte, teren uprzątnięty.', 'Wycinka wykonana, pień sfrezowany.'],
  posadzenie: ['Posadzono zgodnie z projektem, misa wykonana.', 'Roślina posadzona i podlana.'],
  korowanie: ['Kora rozłożona równomiernie.', 'Misa odchwaszczona i wyściółkowana.'],
  palikowanie: ['Trzy paliki wbite, taśma założona.', 'Paliki ustabilizowane.'],
};

const REJECTION_REASONS: Record<TaskCategory, readonly string[]> = {
  pielegnacja: ['Niewystarczające podlanie — misa sucha na zdjęciu.', 'Na zdjęciu nie widać wykonanego cięcia. Proszę dosłać zdjęcie korony.'],
  wycinka: ['Na zdjęciu widoczny pozostawiony pień. Proszę sfrezować pień i uprzątnąć teren.', 'Gałęzie pozostawione na chodniku — proszę uprzątnąć.'],
  nasadzanie: ['Krzywo wbity palik — proszę poprawić stabilizację.', 'Brak wymaganej warstwy kory w misie.'],
};

// ---------------------------------------------------------------------------
// 4. Enrichment
// ---------------------------------------------------------------------------

export interface EnrichedTask {
  id: string;
  category: TaskCategory;
  subcategory: TaskSubcategory;
  status: TaskStatus;
  description: string;
  contract_number: string;
  contract_scan_url: string;
  contractor_comment: string | null;
  contractor_photo_url: string | null;
  completed_at: string | null;
  official_rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface EnrichedPlant {
  id: string;
  source_name: string | null;
  type: PlantType;
  /** Year part of the code (`D{n}/{code_year}`); the number is assigned when inserting. */
  code_year: number;
  species_id: number;
  latitude: number;
  longitude: number;
  district: string;
  address: string;
  plot_number: string;
  parcel_geometry: string | null;
  planting_year: number | null;
  is_from_decision: 0 | 1;
  decision_number: string | null;
  status: TreeStatus;
  contractor_id: string | null;
  contract_number: string;
  contract_scan_url: string;
  funding_source: string;
  notes: string;
  created_by: string;
  created_at: string;
  tasks: EnrichedTask[];
}

/** Planting dates for the warranty alerts: now − 3 years + N days (inside the 31-day alert window). */
const WARRANTY_ALERT_OFFSETS_DAYS = [3, 8, 12, 17, 23, 28];
const DECISION_SHARE = 0.25;
const YEAR_POOL: readonly (number | null)[] = [2026, 2026, 2025, 2025, 2025, 2024, 2024, 2024, 2023, 2023, null];

const iso = (ms: number) => new Date(ms).toISOString();

function addYears(date: Date, years: number): Date {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

const treeIdFor = (index: number) => `${BDOT10K_TREE_ID_PREFIX}${String(index + 1).padStart(12, '0')}`;
const taskIdFor = (treeIndex: number, taskIndex: number) =>
  `${BDOT10K_TASK_ID_PREFIX}${String(treeIndex + 1).padStart(9, '0')}${String(taskIndex + 1).padStart(3, '0')}`;

/**
 * Pure function: the same points + the same `now` always give the same plants.
 * Splits: 80% tree / 20% shrub, 70% green / 12% yellow / 10% blue / 8% red, ~25% of trees from decisions
 * (at least 6 planted in Oct/Nov three years ago → 3-year warranty alerts).
 */
export function enrichBdot10kPoints(
  points: readonly KmlPoint[],
  now: Date = new Date(),
  geocodedCache: Record<string, GeocodedPointCacheEntry> = loadBdot10kGeocoded(),
): EnrichedPlant[] {
  const rand = mulberry32(RANDOM_SEED);
  const nowMs = now.getTime();
  const currentYear = now.getUTCFullYear();
  const total = points.length;

  const types = shuffle(rand, quota<PlantType>(total, { tree: 0.8, shrub: 0.2 }));
  const statuses = shuffle(rand, quota<TreeStatus>(total, { green: 0.7, yellow: 0.12, blue: 0.1, red: 0.08 }));

  const treeIndexes = shuffle(rand, types.flatMap((type, i) => (type === 'tree' ? [i] : [])));
  const alertIndexes = new Set(
    treeIndexes.filter((i) => statuses[i] === 'green').slice(0, WARRANTY_ALERT_OFFSETS_DAYS.length),
  );
  const decisionTarget = Math.max(alertIndexes.size, Math.round(treeIndexes.length * DECISION_SHARE));
  const decisionIndexes = new Set(alertIndexes);
  for (const i of treeIndexes) {
    if (decisionIndexes.size >= decisionTarget) break;
    if (statuses[i] !== 'red') decisionIndexes.add(i);
  }

  const statusCounters: Record<TreeStatus, number> = { green: 0, yellow: 0, blue: 0, red: 0 };
  let alertCounter = 0;
  let decisionCounter = 0;
  let shrubSpeciesCounter = 0;

  return points.map((point, index): EnrichedPlant => {
    const type = types[index] ?? 'tree';
    const status = statuses[index] ?? 'green';
    const statusOrder = statusCounters[status]++;
    const isAlert = alertIndexes.has(index);
    const isFromDecision = decisionIndexes.has(index);
    const createdBy = pick(rand, OFFICIAL_IDS);

    // Planting year + record date (the warranty modal treats created_at as the planting date).
    let plantingYear: number | null;
    let createdMs: number;
    if (isAlert) {
      const offset = WARRANTY_ALERT_OFFSETS_DAYS[alertCounter++] ?? 14;
      createdMs = addYears(now, -3).getTime() + offset * MS_PER_DAY;
      plantingYear = new Date(createdMs).getUTCFullYear();
    } else {
      plantingYear = status === 'blue' ? currentYear : pick(rand, YEAR_POOL);
      if (isFromDecision && (plantingYear === null || plantingYear <= currentYear - 3)) {
        plantingYear = pick(rand, [currentYear - 2, currentYear - 1, currentYear]);
      }
      if (plantingYear === null) {
        createdMs = nowMs - between(rand, 60, 400) * MS_PER_DAY;
      } else {
        createdMs = Date.UTC(plantingYear, between(rand, 2, 10), between(rand, 1, 28), between(rand, 7, 15));
        if (createdMs > nowMs - MS_PER_DAY) createdMs = nowMs - between(rand, 3, 60) * MS_PER_DAY;
        if (new Date(createdMs).getUTCFullYear() !== plantingYear) createdMs = Date.UTC(plantingYear, 0, 2, 9);
      }
    }

    const decisionYear = plantingYear ?? currentYear;
    const decisionNumber = isFromDecision
      ? `WKS-I.6131.${12 + 7 * decisionCounter++}.${decisionYear}.${pick(rand, DECISION_INITIALS)}`
      : null;

    // Consume 1 PRNG step to keep all subsequent random sequences identical,
    // while assigning a maximally diverse species_id without collisions.
    void rand();
    const speciesId =
      type === 'tree'
        ? TREE_SPECIES_IDS[index % TREE_SPECIES_IDS.length]!
        : SHRUB_SPECIES_IDS[shrubSpeciesCounter++ % SHRUB_SPECIES_IDS.length]!;
    const fallbackDistrict =
      DISTRICTS.find((d) => d.matches(point.latitude, point.longitude)) ?? DISTRICTS[DISTRICTS.length - 1]!;
    // Advance PRNG identically regardless of whether geocodedCache has this point.
    const fallbackStreet = pick(rand, fallbackDistrict.streets);
    const fallbackHouse = between(rand, 1, 64);
    const fallbackPlotSuffix = rand() < 0.4 ? `/${between(rand, 1, 9)}` : '';
    const fallbackPlotNumber = `146201_1.${fallbackDistrict.precinct}.${between(rand, 100, 999)}${fallbackPlotSuffix}`;

    const geocoded = geocodedCache[coordKey(point.latitude, point.longitude)];
    const districtName = geocoded?.precinct || fallbackDistrict.name;
    const address = geocoded?.address ?? `${fallbackStreet} ${fallbackHouse}, ${fallbackDistrict.name}, Płock`;
    const plotNumber = geocoded?.plot_number ?? fallbackPlotNumber;
    const parcelGeometry = geocoded?.parcel_geometry ?? null;
    const contract = isFromDecision ? CONTRACTS.gwar : contractForYear(plantingYear);

    const tasks = buildTasks({ rand, index, status, statusOrder, isAlert, createdMs, nowMs, createdBy });
    const hasContractor = tasks.length > 0 || rand() < 0.85;
    const contractorId = hasContractor ? (index % 2 === 1 ? SECOND_CONTRACTOR_ID : CONTRACTOR_ID) : null;

    const sourceLabel = point.name ? `, obiekt ${point.name}` : '';
    const decisionNote = decisionNumber
      ? ` Nasadzenie zastępcze — decyzja ${decisionNumber}, gwarancja 3 lata od posadzenia.`
      : '';

    return {
      id: treeIdFor(index),
      source_name: point.name,
      type,
      code_year: plantingYear ?? currentYear,
      species_id: speciesId,
      latitude: point.latitude,
      longitude: point.longitude,
      district: districtName,
      address,
      plot_number: plotNumber,
      parcel_geometry: parcelGeometry,
      planting_year: plantingYear,
      is_from_decision: isFromDecision ? 1 : 0,
      decision_number: decisionNumber,
      status,
      contractor_id: contractorId,
      contract_number: contract.number,
      contract_scan_url: contract.scan,
      funding_source: pick(rand, FUNDING_SOURCES),
      notes: `Lokalizacja z BDOT10k (TERYT ${BDOT10K_TERYT}${sourceLabel}), obręb ${districtName}.${decisionNote}`,
      created_by: createdBy,
      created_at: iso(createdMs),
      tasks,
    };
  });
}

interface BuildTasksInput {
  rand: Random;
  index: number;
  status: TreeStatus;
  /** Position of this plant among plants with the same status (drives the task-status mix). */
  statusOrder: number;
  isAlert: boolean;
  createdMs: number;
  nowMs: number;
  createdBy: string;
}

/**
 * Tasks consistent with the tree colour rules (agents.md §3):
 *   red    → wycinka: assigned ×3, then rejected
 *   yellow → pending_approval ×4 (one nasadzanie: korowanie), then pielęgnacja assigned
 *   blue   → nasadzanie: posadzenie assigned ×4, then palikowanie rejected
 *   green  → approved history (every 3rd plant + every warranty-alert tree)
 */
function buildTasks(input: BuildTasksInput): EnrichedTask[] {
  const { rand, index, status, statusOrder, isAlert, createdMs, nowMs, createdBy } = input;
  const reviewer = pick(rand, OFFICIAL_IDS);
  const latest = nowMs - MS_PER_HOUR;

  const task = (
    category: TaskCategory,
    subcategory: TaskSubcategory,
    taskStatus: TaskStatus,
    times: { created: number; completed?: number; reviewed?: number },
  ): EnrichedTask => {
    const contract = isAlert ? CONTRACTS.gwar : CONTRACT_FOR_CATEGORY[category];
    const done = taskStatus !== 'assigned';
    const reviewed = taskStatus === 'approved' || taskStatus === 'rejected';
    return {
      id: taskIdFor(index, 0),
      category,
      subcategory,
      status: taskStatus,
      description: pick(rand, TASK_DESCRIPTIONS[subcategory]),
      contract_number: contract.number,
      contract_scan_url: contract.scan,
      contractor_comment: done ? pick(rand, CONTRACTOR_COMMENTS[subcategory]) : null,
      contractor_photo_url: done ? PHOTO_FOR_SUBCATEGORY[subcategory] : null,
      completed_at: done && times.completed !== undefined ? iso(Math.min(times.completed, latest)) : null,
      official_rejection_reason: taskStatus === 'rejected' ? pick(rand, REJECTION_REASONS[category]) : null,
      reviewed_by: reviewed ? reviewer : null,
      reviewed_at: reviewed && times.reviewed !== undefined ? iso(Math.min(times.reviewed, latest)) : null,
      created_by: createdBy,
      created_at: iso(Math.min(times.created, latest)),
    };
  };

  const daysAgo = (min: number, max: number) => nowMs - between(rand, min, max) * MS_PER_DAY;
  const hoursAgo = (min: number, max: number) => nowMs - between(rand, min, max) * MS_PER_HOUR;
  const afterPlanting = (ms: number) => Math.max(ms, createdMs + MS_PER_DAY);

  switch (status) {
    case 'red':
      return statusOrder < 3
        ? [task('wycinka', 'wycinka', 'assigned', { created: afterPlanting(daysAgo(1, 10)) })]
        : [task('wycinka', 'wycinka', 'rejected', { created: afterPlanting(daysAgo(8, 14)), completed: daysAgo(4, 6), reviewed: daysAgo(1, 3) })];

    case 'yellow': {
      if (statusOrder < 4) {
        const [category, subcategory]: [TaskCategory, TaskSubcategory] =
          statusOrder === 3 ? ['nasadzanie', 'korowanie'] : ['pielegnacja', pick(rand, ['nawozenie', 'podlewanie', 'przycinanie'] as const)];
        return [task(category, subcategory, 'pending_approval', { created: afterPlanting(daysAgo(3, 12)), completed: hoursAgo(1, 47) })];
      }
      const subcategory = pick(rand, ['nawozenie', 'podlewanie', 'przycinanie'] as const);
      return [task('pielegnacja', subcategory, 'assigned', { created: afterPlanting(daysAgo(1, 9)) })];
    }

    case 'blue':
      return statusOrder < 4
        ? [task('nasadzanie', 'posadzenie', 'assigned', { created: afterPlanting(daysAgo(1, 7)) })]
        : [task('nasadzanie', 'palikowanie', 'rejected', { created: afterPlanting(daysAgo(7, 12)), completed: daysAgo(3, 5), reviewed: daysAgo(1, 2) })];

    case 'green': {
      if (isAlert) {
        return [task('nasadzanie', 'posadzenie', 'approved', {
          created: createdMs - 7 * MS_PER_DAY,
          completed: createdMs,
          reviewed: createdMs + 2 * MS_PER_DAY,
        })];
      }
      if (statusOrder % 3 !== 0) return [];
      const subcategory = pick(rand, ['nawozenie', 'podlewanie', 'przycinanie'] as const);
      const created = afterPlanting(daysAgo(15, 150));
      return [task('pielegnacja', subcategory, 'approved', {
        created,
        completed: created + 2 * MS_PER_DAY,
        reviewed: created + 3 * MS_PER_DAY,
      })];
    }
  }
}

/** Closes an open seed task as `approved` (plants forced to green in `databaseFixes.ts`). */
function approveSeedTask(task: EnrichedTask): EnrichedTask {
  if (task.status === 'approved') return task;
  const completedAt = task.completed_at ?? task.created_at;
  return {
    ...task,
    status: 'approved',
    contractor_comment: task.contractor_comment ?? CONTRACTOR_COMMENTS[task.subcategory][0] ?? null,
    contractor_photo_url: task.contractor_photo_url ?? PHOTO_FOR_SUBCATEGORY[task.subcategory],
    completed_at: completedAt,
    official_rejection_reason: null,
    reviewed_by: task.reviewed_by ?? task.created_by,
    reviewed_at: task.reviewed_at ?? completedAt,
  };
}

// ---------------------------------------------------------------------------
// 5. Database seeding
// ---------------------------------------------------------------------------

export interface Bdot10kSeedSummary {
  source: string;
  teryt: string;
  parsed_points: number;
  inserted_trees: number;
  inserted_tasks: number;
  skipped_existing: number;
  total_trees: number;
  warranty_alert_trees: number;
}

const countTrees = () => queryOne<{ n: number }>('SELECT count(*) AS n FROM trees')?.n ?? 0;

/** Highest number used by a prefix in any year (BDOT10k codes continue the global sequence: D10/2026, D11/2025…). */
const maxCodeNumber = (prefix: 'D' | 'K') =>
  queryOne<{ n: number }>(
    `SELECT COALESCE(MAX(CAST(substr(code, 2, instr(code, '/') - 2) AS INTEGER)), 0) AS n
       FROM trees WHERE substr(code, 1, 1) = :prefix`,
    { prefix },
  )?.n ?? 0;

/** Updates BDOT10k note text when precinct changes (e.g. `), Stare Miasto.` -> `), obręb Śródmieście.`). */
function refreshBdot10kNotePrecinct(notes: string | null, precinct: string | null): string | null {
  if (!notes || !precinct || !notes.startsWith('Lokalizacja z BDOT10k')) return notes;
  return notes.replace(/\),\s*(?:obręb\s+)?[^.]+\./, `), obręb ${precinct}.`);
}

/** Idempotent: points already imported (deterministic ids) are skipped, so re-running only restores deleted ones. */
export function seedBdot10k(filePath: string = config.bdot10kKmlPath): Bdot10kSeedSummary {
  const geocodedCache = loadBdot10kGeocoded();
  const points = loadBdot10kPoints(filePath);
  const plants = enrichBdot10kPoints(points, new Date(), geocodedCache);

  return withTransaction(() => {
    const existing = new Set(
      queryAll<{ id: string }>(`SELECT id FROM trees WHERE id LIKE :prefix`, { prefix: `${BDOT10K_TREE_ID_PREFIX}%` }).map((r) => r.id),
    );
    const speciesTypes = new Map(
      queryAll<{ id: number; type: PlantType }>('SELECT id, type FROM species_dictionary').map((s) => [s.id, s.type]),
    );
    const nextNumber = { D: maxCodeNumber('D') + 1, K: maxCodeNumber('K') + 1 };

    let insertedTrees = 0;
    let insertedTasks = 0;
    let alertTrees = 0;

    for (const plant of plants) {
      // The number is consumed even for removed plants, so the remaining codes stay stable.
      const prefix = codePrefix(plant.type);
      const code = `${prefix}${nextNumber[prefix]++}/${plant.code_year}`;
      if (isRemovedTree(plant.id, code)) continue;

      if (existing.has(plant.id)) {
        execute(
          `UPDATE trees
              SET address = :address,
                  plot_number = :plotNumber,
                  parcel_geometry = COALESCE(:parcelGeometry, parcel_geometry),
                  notes = :notes
            WHERE id = :id`,
          {
            id: plant.id,
            address: plant.address,
            plotNumber: plant.plot_number,
            parcelGeometry: plant.parcel_geometry,
            notes: plant.notes,
          },
        );
        continue;
      }
      if (speciesTypes.get(plant.species_id) !== plant.type) {
        throw new Error(`[bdot10k] Gatunek ${plant.species_id} nie pasuje do typu "${plant.type}".`);
      }
      const forceGreen = isForcedGreenTree(plant.id, code);
      const status: TreeStatus = forceGreen ? 'green' : plant.status;
      const tasks = forceGreen ? plant.tasks.map(approveSeedTask) : plant.tasks;

      execute(
        `INSERT INTO trees (id, code, type, species_id, latitude, longitude, address, plot_number, parcel_geometry,
                            planting_year, is_from_decision, decision_number, status, contractor_id, contract_number,
                            contract_scan_url, funding_source, notes, created_by, created_at, updated_at)
         VALUES (:id, :code, :type, :speciesId, :latitude, :longitude, :address, :plotNumber, :parcelGeometry,
                 :plantingYear, :isFromDecision, :decisionNumber, :status, :contractorId, :contractNumber,
                 :contractScanUrl, :fundingSource, :notes, :createdBy, :createdAt, :createdAt)`,
        {
          id: plant.id,
          code,
          type: plant.type,
          speciesId: plant.species_id,
          latitude: plant.latitude,
          longitude: plant.longitude,
          address: plant.address,
          plotNumber: plant.plot_number,
          parcelGeometry: plant.parcel_geometry,
          plantingYear: plant.planting_year,
          isFromDecision: plant.is_from_decision,
          decisionNumber: plant.decision_number,
          status,
          contractorId: plant.contractor_id,
          contractNumber: plant.contract_number,
          contractScanUrl: plant.contract_scan_url,
          fundingSource: plant.funding_source,
          notes: plant.notes,
          createdBy: plant.created_by,
          createdAt: plant.created_at,
        },
      );
      insertedTrees++;
      if (plant.is_from_decision && plant.planting_year !== null && plant.planting_year <= new Date().getUTCFullYear() - 3) {
        alertTrees++;
      }

      for (const task of tasks) {
        execute(
          `INSERT INTO tasks (id, tree_id, category, subcategory, status, assigned_to, created_by, description,
                              contract_number, contract_scan_url, contractor_comment, contractor_photo_url,
                              completed_at, official_rejection_reason, reviewed_by, reviewed_at, created_at, updated_at)
           VALUES (:id, :treeId, :category, :subcategory, :status, :assignedTo, :createdBy, :description,
                   :contractNumber, :contractScanUrl, :contractorComment, :contractorPhotoUrl,
                   :completedAt, :rejectionReason, :reviewedBy, :reviewedAt, :createdAt, :updatedAt)`,
          {
            id: task.id,
            treeId: plant.id,
            category: task.category,
            subcategory: task.subcategory,
            status: task.status,
            assignedTo: plant.contractor_id ?? CONTRACTOR_ID,
            createdBy: task.created_by,
            description: task.description,
            contractNumber: task.contract_number,
            contractScanUrl: task.contract_scan_url,
            contractorComment: task.contractor_comment,
            contractorPhotoUrl: task.contractor_photo_url,
            completedAt: task.completed_at,
            rejectionReason: task.official_rejection_reason,
            reviewedBy: task.reviewed_by,
            reviewedAt: task.reviewed_at,
            createdAt: task.created_at,
            updatedAt: task.reviewed_at ?? task.completed_at ?? task.created_at,
          },
        );
        insertedTasks++;
      }
    }

    // Backfill cached GUGiK parcel geometries and addresses for initial seed rows (e.g. from init.sql).
    const seedRows = queryAll<{ id: string; latitude: number; longitude: number }>(
      `SELECT id, latitude, longitude FROM trees WHERE id NOT LIKE :prefix`,
      { prefix: `${BDOT10K_TREE_ID_PREFIX}%` },
    );
    for (const row of seedRows) {
      const cached = geocodedCache[coordKey(row.latitude, row.longitude)];
      if (!cached) continue;
      execute(
        `UPDATE trees
            SET address = COALESCE(:address, address),
                plot_number = COALESCE(:plotNumber, plot_number),
                parcel_geometry = COALESCE(:parcelGeometry, parcel_geometry)
          WHERE id = :id`,
        {
          id: row.id,
          address: cached.address,
          plotNumber: cached.plot_number,
          parcelGeometry: cached.parcel_geometry,
        },
      );
    }

    return {
      source: path.basename(filePath),
      teryt: BDOT10K_TERYT,
      parsed_points: points.length,
      inserted_trees: insertedTrees,
      inserted_tasks: insertedTasks,
      skipped_existing: plants.length - insertedTrees,
      total_trees: countTrees(),
      warranty_alert_trees: alertTrees,
    };
  });
}

/** Startup hook: seed only when the database is sparse (fresh `init.sql` has 10 plants). */
export function seedBdot10kIfSparse(minTrees: number = BDOT10K_MIN_TREES): Bdot10kSeedSummary | null {
  if (countTrees() >= minTrees) return null;
  return seedBdot10k();
}

export interface RecalculateLocationsSummary {
  total_trees: number;
  updated_trees: number;
  from_cache: number;
  from_gugik_live: number;
}

/**
 * Recalculates `address`, `plot_number`, `parcel_geometry` (and BDOT10k precinct note)
 * for all plants in `trees` based on their `(latitude, longitude)` using GUGiK ULDK + UUG
 * (with local cache fallback for known seed points).
 */
export async function recalculateAllTreeLocations(options?: {
  forceLive?: boolean;
}): Promise<RecalculateLocationsSummary> {
  const geocodedCache = options?.forceLive ? {} : loadBdot10kGeocoded();
  const rows = queryAll<{
    id: string;
    latitude: number;
    longitude: number;
    address: string | null;
    plot_number: string | null;
    parcel_geometry: string | null;
    notes: string | null;
  }>('SELECT id, latitude, longitude, address, plot_number, parcel_geometry, notes FROM trees ORDER BY created_at, code');

  const resolved: {
    id: string;
    address: string | null;
    plotNumber: string | null;
    parcelGeometry: string | null;
    notes: string | null;
    changed: boolean;
  }[] = [];

  let fromCache = 0;
  let fromGugikLive = 0;

  for (const row of rows) {
    const key = coordKey(row.latitude, row.longitude);
    let entry = geocodedCache[key];
    if (entry) {
      fromCache++;
    } else {
      const live = await reverseGeocodePoint(row.latitude, row.longitude);
      fromGugikLive++;
      entry = {
        address: live.address,
        plot_number: live.plot_number,
        precinct: live.precinct,
        parcel_geometry: live.geometry ? JSON.stringify(live.geometry) : null,
      };
    }

    const nextAddress = entry.address ?? row.address;
    const nextPlotNumber = entry.plot_number ?? row.plot_number;
    const nextParcelGeometry = entry.parcel_geometry ?? row.parcel_geometry;
    const nextNotes = refreshBdot10kNotePrecinct(row.notes, entry.precinct);
    const changed =
      nextAddress !== row.address ||
      nextPlotNumber !== row.plot_number ||
      nextParcelGeometry !== row.parcel_geometry ||
      nextNotes !== row.notes;

    resolved.push({
      id: row.id,
      address: nextAddress,
      plotNumber: nextPlotNumber,
      parcelGeometry: nextParcelGeometry,
      notes: nextNotes,
      changed,
    });
  }

  let updatedTrees = 0;
  withTransaction(() => {
    const now = nowIso();
    for (const item of resolved) {
      if (!item.changed) continue;
      execute(
        `UPDATE trees
            SET address = :address,
                plot_number = :plotNumber,
                parcel_geometry = :parcelGeometry,
                notes = :notes,
                updated_at = :now
          WHERE id = :id`,
        {
          id: item.id,
          address: item.address,
          plotNumber: item.plotNumber,
          parcelGeometry: item.parcelGeometry,
          notes: item.notes,
          now,
        },
      );
      updatedTrees++;
    }
  });

  return {
    total_trees: rows.length,
    updated_trees: updatedTrees,
    from_cache: fromCache,
    from_gugik_live: fromGugikLive,
  };
}
