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
  read: 'Solo lettura',
  write: 'Lettura e scrittura',
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
