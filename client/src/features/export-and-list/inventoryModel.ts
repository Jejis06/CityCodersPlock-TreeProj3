import { speciesLabel, type PlantType, type Task, type TreeListItem } from '@/types/domain';

/** Subset of GET /api/tasks needed to detect plants handled under an administrative decision. */
export type InventoryTask = Pick<Task, 'tree_id' | 'description' | 'category'>;

/** Tree row of the list view: API fields + values derived on the client (not stored in the DB). */
export interface ListTree extends TreeListItem {
  street: string | null;
  species_label: string;
  from_decision: boolean;
  /** Decision number found in notes/task descriptions (e.g. "WOŚ.6131.12.2026"), or a short reason. */
  decision_ref: string | null;
}

export interface SpeciesFrequency {
  key: string;
  label: string;
  latinName: string;
  type: PlantType;
  speciesId: number;
  count: number;
}

const DECISION_NUMBER = /decyzj\w*\s*(?:nr\s*)?([A-ZĄĆĘŁŃÓŚŹŻ]{2,}[\w.\-/]*\d)/i;
const DECISION_HINT = /decyzj|nasadzeni\w* zastępcz|zezwoleni\w* na usunięcie/i;

/** "ul. Tumska 8, Płock" -> "ul. Tumska"; "Stary Rynek, Płock" -> "Stary Rynek". */
export function streetFromAddress(address: string | null): string | null {
  const firstPart = address?.split(',')[0]?.trim();
  if (!firstPart) return null;
  return firstPart.replace(/\s+\d+[a-z]?(?:\/\d+[a-z]?)?$/i, '').trim() || null;
}

function detectDecision(texts: (string | null | undefined)[]): { from: boolean; ref: string | null } {
  let from = false;
  for (const text of texts) {
    if (!text) continue;
    const number = DECISION_NUMBER.exec(text);
    if (number?.[1]) return { from: true, ref: number[1] };
    if (DECISION_HINT.test(text)) from = true;
  }
  return { from, ref: from ? 'Nasadzenie zastępcze / decyzja' : null };
}

export function toListTrees(trees: TreeListItem[], tasks: InventoryTask[]): ListTree[] {
  const descriptionsByTree = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.description) continue;
    const list = descriptionsByTree.get(task.tree_id) ?? [];
    list.push(task.description);
    descriptionsByTree.set(task.tree_id, list);
  }

  return trees.map((tree) => {
    const decision = detectDecision([tree.notes, ...(descriptionsByTree.get(tree.id) ?? [])]);
    return {
      ...tree,
      street: streetFromAddress(tree.address),
      species_label: speciesLabel(tree.species_polish_name, tree.species_cultivar),
      from_decision: decision.from,
      decision_ref: decision.ref,
    };
  });
}

/** Data behind the OX (species) / OY (count) chart, most frequent first. */
export function speciesFrequency(trees: ListTree[]): SpeciesFrequency[] {
  const bySpecies = new Map<number, SpeciesFrequency>();
  for (const tree of trees) {
    const entry = bySpecies.get(tree.species_id);
    if (entry) {
      entry.count += 1;
    } else {
      bySpecies.set(tree.species_id, {
        key: String(tree.species_id),
        label: tree.species_label,
        latinName: tree.species_latin_name,
        type: tree.type,
        speciesId: tree.species_id,
        count: 1,
      });
    }
  }
  return [...bySpecies.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pl'));
}

/** Natural order of inventory codes: D before K, then year, then number (D2 < D10). */
export function compareTreeCodes(a: string, b: string): number {
  const parse = (code: string) => {
    const match = /^([A-Z])(\d+)\/(\d{4})$/.exec(code);
    return match ? { prefix: match[1] ?? '', n: Number(match[2]), year: Number(match[3]) } : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.localeCompare(b, 'pl');
  return pa.prefix.localeCompare(pb.prefix) || pa.year - pb.year || pa.n - pb.n;
}

export function todayIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
