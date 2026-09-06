/**
 * Diff prima/dopo per l'audit degli account utente tenant. Puro e senza
 * dipendenze: i campi confrontati sono quelli mutabili dalle superfici di
 * gestione utenti; gli array si confrontano senza ordine.
 */
export interface TenantUserAuditSnapshot {
  readonly displayName: string;
  readonly role: string;
  readonly isActive: boolean;
  readonly hasAllLocationsAccess: boolean;
  readonly assignedLocationIds: readonly string[];
  readonly defaultLocationId: string | null;
  readonly permissions: readonly string[];
}

export type TenantUserAuditDiff = Record<
  string,
  { readonly before: unknown; readonly after: unknown }
>;

const ARRAY_FIELDS = ['assignedLocationIds', 'permissions'] as const;
const SCALAR_FIELDS = [
  'displayName',
  'role',
  'isActive',
  'hasAllLocationsAccess',
  'defaultLocationId',
] as const;

function sortedCopy(values: readonly string[]): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = sortedCopy(a);
  const sortedB = sortedCopy(b);
  return sortedA.every((value, index) => value === sortedB[index]);
}

export function diffTenantUserSnapshots(
  before: TenantUserAuditSnapshot,
  after: TenantUserAuditSnapshot,
): TenantUserAuditDiff {
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  for (const field of SCALAR_FIELDS) {
    if (before[field] !== after[field]) {
      diff[field] = { before: before[field], after: after[field] };
    }
  }
  for (const field of ARRAY_FIELDS) {
    if (!sameArray(before[field], after[field])) {
      diff[field] = { before: sortedCopy(before[field]), after: sortedCopy(after[field]) };
    }
  }

  return diff;
}

/** Stato iniziale registrato alla creazione di un account. */
export function tenantUserCreationDetails(snapshot: TenantUserAuditSnapshot): TenantUserAuditDiff {
  const details: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of [...SCALAR_FIELDS, ...ARRAY_FIELDS]) {
    const value = field === 'assignedLocationIds' || field === 'permissions'
      ? sortedCopy(snapshot[field])
      : snapshot[field];
    details[field] = { before: null, after: value };
  }
  return details;
}
