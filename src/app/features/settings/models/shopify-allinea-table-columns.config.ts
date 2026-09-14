import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * Le coppie NON ALLINEATE del controllo «Allinea giacenze su Shopify»
 * (`docs/26` A3).
 *
 * ⛔ **Era un `<ul>` con quattro `<span>` per riga**: con trecento righe cercare
 *    una sede o un motivo era scorrere. Il proprietario l'ha visto a schermo e
 *    l'ha segnalato. Entrato nel motore comune l'11/09/2026: filtro a valori su
 *    Sede e Motivo, ordinamento, colonne.
 *
 * ⭐ **Il dettaglio diventa una COLONNA**: era nel `title` della riga, cioè
 *    leggibile solo passandoci sopra col mouse — e sul telefono mai. Il motore
 *    lo taglia a colonna e lo tiene intero nel `title` della cella, come ogni
 *    altro testo lungo; chi non lo vuole lo spegne da Colonne.
 *
 * ⚠️ Nessuna riga totali (niente numeri) e nessuna azione: è un rapporto.
 */
export const SHOPIFY_ALLINEA_VIEW = TableViewId.ShopifyAllineaNonAllineate;

export const SHOPIFY_ALLINEA_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'articolo', label: 'Articolo', filter: 'text', defaultVisible: true, cardTitle: true },
  { id: 'variante', label: 'Variante', filter: 'text', defaultVisible: true, defaultWidthPx: 160 },
  colonna('location', { filter: 'values', defaultVisible: true, defaultWidthPx: 160 }),
  { id: 'motivo', label: 'Motivo', filter: 'values', defaultVisible: true, defaultWidthPx: 220 },
  { id: 'dettaglio', label: 'Dettaglio', filter: 'text', defaultVisible: true },
] as const;

export const SHOPIFY_ALLINEA_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['articolo', 'variante', 'location', 'motivo', 'dettaglio'],
  [TableViewPresetId.Operational]: ['articolo', 'variante', 'location', 'motivo'],
  [TableViewPresetId.Warehouse]: ['articolo', 'variante', 'location', 'motivo'],
  [TableViewPresetId.Accountant]: ['articolo', 'location', 'motivo', 'dettaglio'],
  [TableViewPresetId.Supplier]: ['articolo', 'variante', 'motivo'],
  [TableViewPresetId.Analysis]: ['articolo', 'variante', 'location', 'motivo', 'dettaglio'],
};
