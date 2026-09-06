import type { Money } from '@core/models/money.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { activeListinoSlots } from '@domain/products/models/product-listino.model';
import type { TenantFeatureSettings } from '@domain/tenant/models/tenant-feature-settings.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * Listino scelto in testata documento (§B4). `article` è il prezzo di vendita
 * dell'articolo, cioè il comportamento di sempre: è il valore di partenza e non
 * è un listino aggiuntivo, per questo non ha una posizione.
 */
export type DocumentListinoChoice = 'article' | 1 | 2 | 3;

/** Valore della tendina quando è selezionato il prezzo di vendita. */
export const ARTICLE_LISTINO_VALUE = 'article';

/**
 * Opzioni della tendina: il prezzo di vendita più i soli listini che il tenant ha
 * attivato. Un listino spento non compare — per quel tenant non esiste.
 */
export function listinoSelectOptions(
  settings: TenantFeatureSettings | null,
): readonly SelectMenuOption[] {
  return [
    { value: ARTICLE_LISTINO_VALUE, label: 'Prezzo di vendita' },
    ...activeListinoSlots(settings).map((slot) => ({
      value: String(slot.position),
      label: slot.label,
    })),
  ];
}

/** Testo della tendina → scelta tipizzata. Valore sconosciuto = prezzo di vendita. */
export function parseListinoChoice(value: string | null | undefined): DocumentListinoChoice {
  if (value === '1' || value === '2' || value === '3') {
    return Number(value) as 1 | 2 | 3;
  }
  return 'article';
}

/**
 * Prezzo unitario che la riga deve prendere per la scelta corrente.
 *
 * `null` significa **una cosa sola**: l'articolo non ha un valore per il
 * listino scelto. Non è un errore di lettura e non si ripiega sul prezzo
 * articolo — chi chiama mette la riga a zero e lo segnala, perché un prezzo che
 * nessuno ha deciso non deve finire in un documento senza che si veda.
 */
export function listinoUnitPrice(
  variant: Pick<VariantSummary, 'sellingPrice' | 'listinoPrices'>,
  choice: DocumentListinoChoice,
): Money | null {
  if (choice === 'article') {
    return variant.sellingPrice;
  }
  return variant.listinoPrices?.[choice] ?? null;
}

/**
 * Una riga da riprezzare: il nome che l'avviso userà, e i dati prezzo della
 * variante — `null` se la riga non ha un articolo, o se il riepilogo non c'è.
 */
export interface ListinoRepricingLine {
  /** Il nome mostrato nell'avviso. Vuoto = si compone dal riepilogo. */
  readonly displayName: string;
  readonly variant: Pick<
    VariantSummary,
    'sellingPrice' | 'listinoPrices' | 'productName' | 'variantLabel'
  > | null;
}

export interface ListinoRepricing {
  /**
   * Il prezzo che ogni riga deve prendere, nello stesso ordine di ingresso.
   * `null` = la riga non si tocca (non ha articolo, o manca il riepilogo).
   */
  readonly prices: readonly (Money | null)[];
  /** I nomi degli articoli senza prezzo per il listino scelto. */
  readonly missing: readonly string[];
}

/**
 * **Che cosa fa il Listino, in un posto solo.**
 *
 * Il Listino di testata stabilisce **quale prezzo dell'anagrafica** diventa il
 * prezzo proposto delle righe. Non calcola uno sconto, non applica una
 * percentuale: sceglie il campo sorgente. E la scelta vale sia per le righe
 * nuove sia per **quelle già inserite** — cambiarlo riprezza il documento.
 *
 * ⛔ **Questa funzione esiste per un errore di analisi, e vale scriverlo.**
 * Le due maschere che hanno il Listino recuperano i dati della variante in modi
 * diversi — una li chiede al servizio, l'altra li ha già in memoria — e da
 * quella differenza era stato concluso che «l'effetto non è condiviso perché
 * sono due logiche di dominio diverse». **È sbagliato**: il comportamento di
 * dominio è UNO, e quelle sono due strade tecniche per procurarsi lo stesso
 * dato. Prendere lo stato dell'implementazione e promuoverlo a regola è
 * esattamente il contrario di quello che questo progetto fa.
 *
 * ⭐ Quindi qui sta tutto ciò che è dominio: quale prezzo, quali righe restano
 * senza, come si chiamano nell'avviso. Alla maschera resta **come si procura i
 * riepiloghi** e **come scrive il campo** (che dipende dalla sua modalità
 * netto/ivato) — due cose che non sono il Listino.
 *
 * ## ⛔ Listino e netto/ivato sono DUE meccanismi indipendenti
 *
 * È la confusione che ha generato l'errore sopra, e va tenuta separata a parole
 * prima che nel codice:
 *
 * ```text
 * LISTINO          sceglie la SORGENTE del prezzo
 *                  Prezzo vendita 25,00 · Listino 1 22,00 · Listino 2 20,00
 *                  → scelgo Listino 2 → la riga vale 20,00
 *                  ⛔ nessuna divisione, nessuna moltiplicazione, nessuno scorporo
 *
 * NETTO/IVATO      sceglie la RAPPRESENTAZIONE dello stesso prezzo
 *                  25,00 ivati al 22% → netto 20,491803…
 *                  ⭐ qui, e solo qui, c'è la divisione: ivato × 100 / (100 + aliquota)
 * ```
 *
 * ⚠️ **Questa funzione non fa aritmetica**, e non è una svista: restituisce il
 * prezzo dell'anagrafica così com'è. La conversione la fa la maschera, con la
 * modalità del proprio documento — perché lo stesso listino, sullo stesso
 * articolo, si scrive in due modi diversi su un documento netto e su uno ivato.
 */
export function listinoRepricing(
  lines: readonly ListinoRepricingLine[],
  choice: DocumentListinoChoice,
): ListinoRepricing {
  const prices: (Money | null)[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    if (!line.variant) {
      prices.push(null);
      continue;
    }
    const price = listinoUnitPrice(line.variant, choice);
    if (!price) {
      // ⛔ Il nome della riga, non il titolo del riepilogo: quello CONTIENE la
      // variante, e il messaggio nominerebbe l'articolo con dentro taglia e
      // colore mentre la riga non li ha. Nome e variante si compongono
      // accanto, non dentro.
      missing.push(
        line.displayName.trim() ||
          [line.variant.productName, line.variant.variantLabel].filter(Boolean).join(' · '),
      );
    }
    prices.push(price);
  }
  return { prices, missing };
}

/**
 * L'avviso per le righe rimaste senza prezzo. Stringa vuota = niente da dire.
 *
 * ⚠️ Era scritto due volte, e le due copie **divergevano su un apostrofo** —
 * `l'articolo` in una, `l'articolo` tipografico nell'altra. Lo stesso messaggio
 * con due glifi diversi a seconda della maschera: nessun test lo vedeva.
 */
export function listinoMissingWarning(listinoLabel: string, missing: readonly string[]): string {
  if (missing.length === 0) {
    return '';
  }
  const uno = missing.length === 1;
  return (
    `${listinoLabel}: nessun prezzo per ${uno ? 'l’articolo' : 'gli articoli'} ` +
    `${missing.join(', ')}. ${uno ? 'La riga è rimasta' : 'Le righe sono rimaste'} a zero.`
  );
}
