/** Etichette it-IT per gli scope OAuth Shopify (evita stringhe tecniche in UI). */

export type ShopifyScopeAccess = 'read' | 'write';

export interface ShopifyScopeDisplay {
  readonly label: string;
  readonly description: string;
  readonly access: ShopifyScopeAccess;
}

const SCOPE_DISPLAY: Record<string, ShopifyScopeDisplay> = {
  read_orders: {
    label: 'Ordini online',
    description: 'Riceve vendite e aggiornamenti ordini da Shopify.',
    access: 'read',
  },
  write_orders: {
    label: 'Ordini online',
    description: 'Crea e modifica ordini su Shopify.',
    access: 'write',
  },
  read_customers: {
    label: 'Clienti ecommerce',
    description: 'Importa anagrafica clienti dal negozio online.',
    access: 'read',
  },
  write_customers: {
    label: 'Clienti ecommerce',
    description: 'Crea e modifica clienti su Shopify.',
    access: 'write',
  },
  read_inventory: {
    label: 'Giacenze',
    description: 'Legge quantità per location da Shopify.',
    access: 'read',
  },
  write_inventory: {
    label: 'Giacenze',
    description: 'Aggiorna quantità su Shopify (carichi, rettifiche).',
    access: 'write',
  },
  read_locations: {
    label: 'Location',
    description: 'Legge magazzini e punti vendita configurati su Shopify.',
    access: 'read',
  },
  write_locations: {
    label: 'Location',
    description: 'Crea e modifica location su Shopify.',
    access: 'write',
  },
  read_products: {
    label: 'Catalogo prodotti',
    description: 'Legge prodotti e varianti dal negozio online.',
    access: 'read',
  },
  write_products: {
    label: 'Catalogo prodotti',
    description: 'Pubblica e aggiorna prodotti su Shopify.',
    access: 'write',
  },
};

const ACCESS_LABELS: Record<ShopifyScopeAccess, string> = {
  read: 'Lettura',
  write: 'Scrittura',
};

export function shopifyScopeDisplay(scope: string): ShopifyScopeDisplay {
  const known = SCOPE_DISPLAY[scope];
  if (known) {
    return known;
  }

  const access: ShopifyScopeAccess = scope.startsWith('write_') ? 'write' : 'read';
  const slug = scope.replace(/^(read|write)_/, '').replace(/_/g, ' ');
  const label = slug.charAt(0).toUpperCase() + slug.slice(1);

  return {
    label,
    description: `Permesso Shopify: ${scope}`,
    access,
  };
}

export function shopifyScopeAccessLabel(access: ShopifyScopeAccess): string {
  return ACCESS_LABELS[access];
}

export interface GroupedShopifyScopeDisplay {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly access: readonly ShopifyScopeAccess[];
  readonly scopes: readonly string[];
}

const SCOPE_GROUP_ORDER = [
  'Catalogo prodotti',
  'Giacenze',
  'Ordini online',
  'Clienti ecommerce',
  'Location',
] as const;

const GROUP_SUMMARY_DESCRIPTIONS: Record<string, string> = {
  'Catalogo prodotti': 'Importa, pubblica e aggiorna prodotti e varianti.',
  Giacenze: 'Legge e aggiorna le quantità per location.',
  'Ordini online': 'Riceve vendite e aggiornamenti ordini.',
  'Clienti ecommerce': 'Importa l’anagrafica clienti dal negozio online.',
  Location: 'Legge magazzini e punti vendita Shopify.',
  Metaobjects: 'Definizioni e contenuti metaobject.',
  'Metaobject definitions': 'Definizioni struttura metaobject.',
};

/** Raggruppa scope OAuth per area funzionale (es. read+write prodotti → una riga). */
export function groupShopifyScopesForDisplay(
  scopes: readonly string[],
): readonly GroupedShopifyScopeDisplay[] {
  const groups = new Map<
    string,
    {
      label: string;
      access: Set<ShopifyScopeAccess>;
      descriptions: string[];
      scopes: string[];
    }
  >();

  for (const scope of scopes) {
    const display = shopifyScopeDisplay(scope);
    let group = groups.get(display.label);
    if (!group) {
      group = { label: display.label, access: new Set(), descriptions: [], scopes: [] };
      groups.set(display.label, group);
    }
    group.access.add(display.access);
    if (!group.descriptions.includes(display.description)) {
      group.descriptions.push(display.description);
    }
    group.scopes.push(scope);
  }

  const grouped = [...groups.values()].map((group) => {
    const access = [...group.access].sort((left, right) =>
      left === 'read' ? -1 : right === 'read' ? 1 : 0,
    );
    return {
      key: group.label.toLocaleLowerCase('it-IT'),
      label: group.label,
      access,
      description: resolveGroupDescription(group.label, group.descriptions, group.access),
      scopes: group.scopes,
    };
  });

  return grouped.sort((left, right) => {
    const leftIndex = SCOPE_GROUP_ORDER.indexOf(left.label as (typeof SCOPE_GROUP_ORDER)[number]);
    const rightIndex = SCOPE_GROUP_ORDER.indexOf(right.label as (typeof SCOPE_GROUP_ORDER)[number]);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    }
    return left.label.localeCompare(right.label, 'it-IT');
  });
}

function resolveGroupDescription(
  label: string,
  descriptions: readonly string[],
  access: ReadonlySet<ShopifyScopeAccess>,
): string {
  const summary = GROUP_SUMMARY_DESCRIPTIONS[label];
  if (summary) {
    return summary;
  }
  if (access.size > 1) {
    return descriptions[0] ?? `Permessi ${label.toLowerCase()} su Shopify.`;
  }
  return descriptions[0] ?? '';
}
