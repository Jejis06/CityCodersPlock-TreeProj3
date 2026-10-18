import { SECOND_CONTRACTOR_ID } from '../lib/constants.js';
import { execute, nowIso, queryAll, queryOne, withTransaction } from '../lib/db.js';
import { SHRUB_SPECIES_IDS, TREE_SPECIES_IDS } from './bdot10kEnricher.js';

/**
 * Permanent data corrections applied on every server start and after `npm run db:reset`.
 * The same lists are honoured by the seeders, so the fixed rows are never re-created or reverted.
 */

/** Plants removed from the inventory for good (tasks go with them via ON DELETE CASCADE). */
export const REMOVED_TREE_CODES = ['D4/2026', 'D18/2023', 'D60/2026'] as const;
/** Seed ids of the removed plants (BDOT10k codes depend on the seeding date, ids do not). */
export const REMOVED_TREE_IDS = [
  'aaaaaaaa-0000-0000-0000-000000000004',
  'bd010000-1462-4000-8000-000000000010',
  'bd010000-1462-4000-8000-000000000063',
] as const;

/** Plants forced to `green` (healthy), with all their open tasks closed as `approved`. */
export const FORCED_GREEN_TREE_CODES = ['D32/2026', 'D39/2026'] as const;
export const FORCED_GREEN_TREE_IDS = [
  'bd010000-1462-4000-8000-000000000029',
  'bd010000-1462-4000-8000-000000000037',
] as const;

const FIX_REVIEWER_ID = '11111111-1111-1111-1111-111111111111';
const OPEN_TASK_STATUSES = ['assigned', 'pending_approval', 'rejected'] as const;

const includes = (list: readonly string[], value: string) => list.includes(value);

export const isRemovedTree = (id: string, code: string) =>
  includes(REMOVED_TREE_IDS, id) || includes(REMOVED_TREE_CODES, code);

export const isForcedGreenTree = (id: string, code: string) =>
  includes(FORCED_GREEN_TREE_IDS, id) || includes(FORCED_GREEN_TREE_CODES, code);

const inList = (prefix: string, values: readonly string[]) => ({
  sql: values.map((_, i) => `:${prefix}${i}`).join(', '),
  params: Object.fromEntries(values.map((value, i) => [`${prefix}${i}`, value])),
});

export interface DatabaseFixesSummary {
  removed_trees: number;
  greened_trees: number;
  approved_tasks: number;
}

/** Idempotent: a second run changes nothing. */
export function applyDatabaseFixes(): DatabaseFixesSummary {
  const removedCodes = inList('removedCode', REMOVED_TREE_CODES);
  const removedIds = inList('removedId', REMOVED_TREE_IDS);
  const greenCodes = inList('greenCode', FORCED_GREEN_TREE_CODES);
  const openStatuses = inList('openStatus', OPEN_TASK_STATUSES);

  return withTransaction(() => {
    // Ensure 2nd contractor exists in DB for contractor filtering
    execute(
      `INSERT OR IGNORE INTO users (id, full_name, role, device)
       VALUES (:id, 'Marek Wiśniewski', 'contractor', 'tablet')`,
      { id: SECOND_CONTRACTOR_ID },
    );

    const secondContractorTrees =
      queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM trees WHERE contractor_id = :id`, {
        id: SECOND_CONTRACTOR_ID,
      })?.n ?? 0;

    if (secondContractorTrees === 0) {
      execute(
        `UPDATE trees
            SET contractor_id = :secondId
          WHERE contractor_id IS NOT NULL
            AND (
              id IN ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000010')
              OR (id LIKE 'bd010000-1462-4000-8000-%' AND CAST(substr(id, -4) AS INTEGER) % 2 = 0)
            )`,
        { secondId: SECOND_CONTRACTOR_ID },
      );

      execute(
        `UPDATE tasks
            SET assigned_to = :secondId
          WHERE tree_id IN (SELECT id FROM trees WHERE contractor_id = :secondId)`,
        { secondId: SECOND_CONTRACTOR_ID },
      );
    }

    // Ensure BDOT10k plants have diverse species across the dictionary
    const bdotPlants = queryAll<{ id: string; type: 'tree' | 'shrub'; species_id: number }>(
      `SELECT id, type, species_id FROM trees WHERE id LIKE 'bd010000-1462-4000-8000-%' ORDER BY id ASC`,
    );
    let shrubCounter = 0;
    for (const plant of bdotPlants) {
      const pointNum = Number.parseInt(plant.id.slice(-12), 10);
      const index = Number.isFinite(pointNum) && pointNum > 0 ? pointNum - 1 : 0;
      const targetSpeciesId =
        plant.type === 'tree'
          ? TREE_SPECIES_IDS[index % TREE_SPECIES_IDS.length]!
          : SHRUB_SPECIES_IDS[shrubCounter++ % SHRUB_SPECIES_IDS.length]!;
      if (plant.species_id !== targetSpeciesId) {
        execute(`UPDATE trees SET species_id = :speciesId WHERE id = :id`, {
          id: plant.id,
          speciesId: targetSpeciesId,
        });
      }
    }

    const removed = execute(
      `DELETE FROM trees WHERE code IN (${removedCodes.sql}) OR id IN (${removedIds.sql})`,
      { ...removedCodes.params, ...removedIds.params },
    );

    const greenTreeIds = queryAll<{ id: string }>(`SELECT id FROM trees WHERE code IN (${greenCodes.sql})`, greenCodes.params).map(
      (row) => row.id,
    );
    if (greenTreeIds.length === 0) {
      return { removed_trees: removed.changes, greened_trees: 0, approved_tasks: 0 };
    }
    const greenIds = inList('greenId', greenTreeIds);
    const now = nowIso();

    const approved = execute(
      `UPDATE tasks
          SET status = 'approved',
              completed_at = COALESCE(completed_at, :now),
              official_rejection_reason = NULL,
              reviewed_by = COALESCE(reviewed_by, :reviewer),
              reviewed_at = :now,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = :now
        WHERE tree_id IN (${greenIds.sql}) AND status IN (${openStatuses.sql})`,
      { ...greenIds.params, ...openStatuses.params, now, reviewer: FIX_REVIEWER_ID },
    );
    const greened = execute(
      `UPDATE trees SET status = 'green', updated_at = :now WHERE id IN (${greenIds.sql}) AND status <> 'green'`,
      { ...greenIds.params, now },
    );

    return {
      removed_trees: removed.changes,
      greened_trees: greened.changes,
      approved_tasks: approved.changes,
    };
  });
}
