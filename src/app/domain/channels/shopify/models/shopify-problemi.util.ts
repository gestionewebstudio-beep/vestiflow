import type {
  ShopifySetupProblemaAzione,
  ShopifySetupProblemaCausa,
  ShopifySetupProblemaDto,
  ShopifySetupProblemaTipo,
} from './shopify-setup.dto';

/**
 * I PROBLEMI della sincronizzazione Shopify, come si leggono (13/09/2026):
 * etichette in italiano al posto dei codici, il raggruppamento per CAUSA con
 * conteggio, conseguenza e azione, il CSV e i percorsi per aprire l'elemento.
 *
 * ⛔ Qui c'era un elenco di 84 righe piatte in cui 75 erano lo stesso guasto:
 *    chi legge deve vedere UNA causa con 75 elementi, non 75 problemi da
 *    correggere a mano. Funzioni pure, provate.
 */

const ETICHETTA_CAUSA: Record<ShopifySetupProblemaCausa, string> = {
  ordine_permesso_fulfillment_orders: 'Ordine senza sede: manca il permesso di leggerla',
  ordine_assegnazione_in_attesa: 'Ordine senza sede: Shopify non l’ha ancora assegnata',
  ordine_location_non_collegata: 'Ordine senza sede: location Shopify non collegata',
  ordine_riga_divisa: 'Ordine senza sede: riga suddivisa fra più sedi',
  ordine_lettura_fallita: 'Ordine senza sede: lettura della sede fallita',
  ordine_sede_da_rileggere: 'Ordine senza sede: motivo da rileggere',
  ordini_acquisizione_fallita: 'Ordini non acquisiti all’attivazione',
  coppia_senza_base: 'Quantità senza base confermata',
  coppia_non_stoccata: 'Articolo non stoccato nella location Shopify',
  coppia_lettura_fallita: 'Quantità senza base: lettura del canale fallita',
  coppia_ferma_ordine_senza_sede: 'Quantità ferma per un ordine senza sede',
  articolo_sku_ambiguo: 'Articolo escluso: stesso SKU dalle due parti',
  articolo_import_fallito: 'Articolo escluso: import fallito',
  articolo_pubblicazione_fallita: 'Articolo escluso: pubblicazione fallita',
  connessione_ambiti_mancanti: 'Permessi Shopify mancanti',
  connessione_webhook_mancanti: 'Notifiche Shopify non registrate',
};

const ETICHETTA_TIPO: Record<ShopifySetupProblemaTipo, string> = {
  ordine: 'Ordine',
  coppia: 'Articolo × sede',
  articolo: 'Articolo',
  connessione: 'Connessione',
};

export function etichettaCausaProblema(causa: ShopifySetupProblemaCausa): string {
  return ETICHETTA_CAUSA[causa] ?? causa;
}

export function etichettaTipoProblema(tipo: ShopifySetupProblemaTipo): string {
  return ETICHETTA_TIPO[tipo] ?? tipo;
}

/** Un gruppo di problemi con la stessa causa: si legge una volta, con il conteggio. */
export interface GruppoProblemi {
  readonly causa: ShopifySetupProblemaCausa;
  readonly etichetta: string;
  readonly tipo: ShopifySetupProblemaTipo;
  readonly conteggio: number;
  /** I nomi dei primi elementi, per dire DI CHI si parla senza aprire l'elenco. */
  readonly esempi: readonly string[];
  readonly conseguenza: string;
  readonly azione: ShopifySetupProblemaAzione;
}

const ESEMPI_MASSIMI = 3;

/**
 * Per causa, nell'ordine in cui i problemi arrivano (l'API li mette già
 * nell'ordine di lettura: connessione, ordini, coppie, articoli).
 */
export function gruppiPerCausa(
  problemi: readonly ShopifySetupProblemaDto[],
): readonly GruppoProblemi[] {
  const gruppi = new Map<ShopifySetupProblemaCausa, GruppoProblemi>();
  for (const problema of problemi) {
    const presente = gruppi.get(problema.causa);
    if (presente) {
      gruppi.set(problema.causa, {
        ...presente,
        conteggio: presente.conteggio + 1,
        esempi:
          presente.esempi.length < ESEMPI_MASSIMI
            ? [...presente.esempi, problema.nome]
            : presente.esempi,
      });
      continue;
    }
    gruppi.set(problema.causa, {
      causa: problema.causa,
      etichetta: etichettaCausaProblema(problema.causa),
      tipo: problema.tipo,
      conteggio: 1,
      esempi: [problema.nome],
      conseguenza: problema.conseguenza,
      azione: problema.azione,
    });
  }
  return [...gruppi.values()];
}

/** Il percorso della pagina che apre l'elemento, o `null` se non ne ha una. */
export function percorsoProblema(azione: ShopifySetupProblemaAzione | null): string | null {
  if (!azione?.riferimento) {
    return null;
  }
  switch (azione.tipo) {
    case 'apri_ordine':
      return `/app/sales/${azione.riferimento}`;
    case 'apri_articolo':
      return `/app/products/${azione.riferimento}`;
    default:
      return null;
  }
}

/**
 * Le azioni che il pannello esegue o verso cui porta, oltre ai collegamenti.
 * ⛔ «Su Shopify» non è eseguibile da qui: è una cosa da fare là.
 */
export function azioneEseguibile(azione: ShopifySetupProblemaAzione): boolean {
  return (
    azione.tipo !== 'nessuna' &&
    azione.tipo !== 'shopify' &&
    azione.tipo !== 'apri_ordine' &&
    azione.tipo !== 'apri_articolo'
  );
}

/**
 * DOVE si fa l'azione di un problema — le quattro forme di `docs/29` §2.3, e
 * una sola per problema:
 * - `pagina`: in questa pagina, al comando o alla sezione che la compie —
 *   il rimando dichiara il PERIMETRO del comando («tutte le coppie»), perché
 *   una riga non deve far credere di allineare soltanto quell'articolo
 *   (proprietario, 13/09/2026);
 * - `vestiflow`: in un'altra pagina di VestiFlow (l'ordine, l'articolo);
 * - `shopify`: là, e serve al risultato — distinto da «nessuna azione»;
 * - `nessuna`: non c'è niente da fare, e il perché è nell'etichetta.
 */
export type DoveSiFaAzione = 'pagina' | 'vestiflow' | 'shopify' | 'nessuna';

export interface FormaAzione {
  readonly dove: DoveSiFaAzione;
  /** Il testo corto per una riga: verbo e perimetro. */
  readonly breve: string;
}

const ETICHETTA_DOVE: Record<DoveSiFaAzione, string> = {
  pagina: 'In questa pagina',
  vestiflow: 'In VestiFlow',
  shopify: 'Su Shopify',
  nessuna: 'Nessuna azione',
};

export function etichettaDove(dove: DoveSiFaAzione): string {
  return ETICHETTA_DOVE[dove];
}

/**
 * Il TONO di un gruppo (proprietario, 13/09/2026): ambra = intervento necessario o
 * limitazione; neutro = da valutare — un articolo non stoccato in una location può
 * essere un'esclusione voluta, e non deve sembrare un guasto permanente.
 */
export function tonoProblema(azione: ShopifySetupProblemaAzione): 'attenzione' | 'valutare' {
  return azione.tipo === 'shopify' || azione.tipo === 'nessuna' ? 'valutare' : 'attenzione';
}

export function formaAzione(azione: ShopifySetupProblemaAzione): FormaAzione {
  switch (azione.tipo) {
    case 'allinea':
      return {
        dove: 'pagina',
        breve: 'Vai ad Allinea giacenze (tutti gli articoli, tutte le sedi)',
      };
    case 'importa_ordini':
      return { dove: 'pagina', breve: 'Vai a Importa ordini (tutti gli ordini aperti)' };
    case 'webhook':
      return { dove: 'pagina', breve: 'Vai alle notifiche dal negozio' };
    case 'sedi':
      return { dove: 'pagina', breve: 'Vai a Connessione e sedi' };
    case 'permessi':
      return { dove: 'pagina', breve: 'Vai a Connessione e sedi (Disconnetti, poi Connetti)' };
    case 'apri_ordine':
      return { dove: 'vestiflow', breve: 'Apri l’ordine' };
    case 'apri_articolo':
      return { dove: 'vestiflow', breve: 'Apri l’articolo' };
    case 'shopify':
      return { dove: 'shopify', breve: azione.etichetta };
    case 'nessuna':
      return { dove: 'nessuna', breve: azione.etichetta };
  }
}

const CSV_COLONNE = [
  'Tipo',
  'Elemento',
  'Dettaglio',
  'Sede',
  'Causa',
  'Conseguenza',
  'Azione',
  'Rilevato',
] as const;

/** Il BOM: Excel lo vuole per leggere gli accenti come UTF-8. */
const BOM = String.fromCharCode(0xfeff);

function cellaCsv(valore: string | null): string {
  const testo = valore ?? '';
  return /[";\n\r]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo;
}

/**
 * Il CSV dell'elenco (separatore `;`, come lo apre Excel in italiano), con il
 * BOM così gli accenti si leggono. Le righe sono quelle PASSATE: chi esporta
 * esporta ciò che vede, filtri compresi.
 */
export function problemiCsv(problemi: readonly ShopifySetupProblemaDto[]): string {
  const righe = problemi.map((p) =>
    [
      etichettaTipoProblema(p.tipo),
      p.nome,
      p.dettaglio,
      p.sede,
      etichettaCausaProblema(p.causa),
      p.conseguenza,
      p.azione.etichetta,
      p.rilevatoAt ? p.rilevatoAt.slice(0, 16).replace('T', ' ') : '',
    ]
      .map(cellaCsv)
      .join(';'),
  );
  return `${BOM}${[CSV_COLONNE.join(';'), ...righe].join('\r\n')}\r\n`;
}
