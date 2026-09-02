import { describe, expect, it } from 'vitest';

import { STOCK_MOVEMENT_LINE_COLUMNS } from '@domain/documents/models/stock-movement-line-columns.config';
import { STORE_SALE_LINE_COLUMNS } from '@domain/store-sales/models/store-sale-line-columns.config';
import { GOODS_RECEIPT_LINE_COLUMNS } from '@features/documents/models/goods-receipt-line-columns.config';
import { SALES_DOCUMENT_LINE_COLUMNS } from '@features/documents/models/sales-document-line-columns.config';
import { SUPPLIER_ORDER_LINE_COLUMNS } from '@features/orders/models/supplier-order-line-columns.config';
import { CUSTOMER_ORDER_LINE_COLUMNS } from '@features/sales-orders/models/customer-order-line-columns.config';

import { resolveColumnFilterKind } from '@shared/table-columns/table-column-filter.util';
import type { TableColumnDef } from '@shared/table-columns/table-column.model';

/**
 * **Una colonna si comporta allo stesso modo in ogni documento che la
 * dichiara.** Ciò che cambia da una maschera all'altra è QUALI colonne si
 * dichiarano — non come si comportano quelle dichiarate.
 *
 * ⛔ Sta in `src/app/` e non dentro un layer di proposito: verifica i layer, non
 * ne fa parte, ed è l'unico punto da cui si vedono tutte e sei le
 * configurazioni senza violare la direzione delle dipendenze.
 *
 * ⚠️ Nasce da una divergenza vera del 22/08/2026 — l'EAN aggiunto al banco con
 * `defaultVisible: false` e larghezze proprie, una terza forma che nessun altro
 * documento aveva. Nessun test la vedeva, perché ogni configurazione era
 * verificata da sola.
 *
 * ⭐ È la rete del blocco «Document Line» (`DA-FARE`): finché il catalogo
 * canonico delle colonne non esiste, queste definizioni restano duplicate in
 * sei file e divergono in silenzio. Quando il catalogo arriverà, questo test
 * diventerà superfluo — ed è il segno che sarà stato fatto bene.
 */
describe('coerenza delle colonne riga documento', () => {
  const CONFIGURAZIONI: readonly (readonly [string, readonly TableColumnDef[]])[] = [
    ['Ordine cliente', CUSTOMER_ORDER_LINE_COLUMNS],
    ['Arrivo merce', GOODS_RECEIPT_LINE_COLUMNS],
    ['Documento di vendita', SALES_DOCUMENT_LINE_COLUMNS],
    ['Ordine fornitore', SUPPLIER_ORDER_LINE_COLUMNS],
    ['Movimenti di magazzino', STOCK_MOVEMENT_LINE_COLUMNS],
    ['Vendita al banco', STORE_SALE_LINE_COLUMNS],
  ];

  /**
   * ⏸️ **Le divergenze già presenti il 22/08/2026, ognuna NOMINATA.**
   *
   * Non sono approvate: sono *dichiarate*, in attesa che il proprietario scelga
   * la forma canonica. La differenza conta — una divergenza elencata qui è
   * visibile e ha una scadenza; una non elencata passerebbe inosservata.
   *
   * ⛔ **Non si aggiunge una voce a questo elenco per far passare un test.** Si
   * aggiunge solo registrando una divergenza che esisteva già, con la data.
   */
  const DIVERGENZE_NOTE: Readonly<Record<string, readonly string[]>> = {
    /*
      ⛔ **`product` · label — e la divergenza NON è dove sembrava.**

      «Articolo» al banco, «Nome prodotto» negli altri cinque. Il 02/09/2026 si
      stava per allineare a «Articolo», sulla premessa che la testata condivisa
      avesse già la forma canonica. **La premessa è falsa, e va scritta perché
      il prossimo non ci ricaschi**: `document-line-head` dà a questa colonna
      DUE etichette diverse, nella stessa testata —

      ```text
      colonna ordinabile      <button>  «Nome prodotto»   (riga 140)
      colonna non ordinabile  <span>    «Articolo»        (riga 151)
      ```

      ⚠️ Quindi la forma canonica **non esiste ancora**: la testata diverge da
      sé, e allineare i cataloghi all'una o all'altra sceglierebbe per il
      proprietario invece di chiedergli. Prima si decide che parola porta quella
      colonna, poi si allineano sei cataloghi e due rami della testata.

      ⭐ **`quantity` invece è stata DECISA e allineata** lo stesso giorno: lì la
      testata ha una forma sola — `<span title="Quantità">Q.tà</span>` — e i
      cataloghi che dicevano «Qtà» e «Quantità» sono passati a «Q.tà». Il
      difetto era visibile: si accendeva «Quantità» nel selettore Colonne e sulla
      colonna si trovava «Q.tà».

      Le larghezze restano dichiarate qui, e non è una resa: `product` va da 240
      a 300px perché sul Movimento — senza prezzo, sconto e IVA — quella riga ha
      spazio da dare al nome. Non è divergenza, è adattamento.
    */
    product: ['label', 'defaultWidthPx'],
    quantity: ['defaultWidthPx', 'minWidthPx'],
    // ⭐ `label` e `numeric` sono usciti da qui il 22/08/2026, DECISI dal
    // proprietario: etichetta canonica «IVA», e `numeric: false` ovunque —
    // il Codice IVA è alfanumerico (`22`, `22r`, `10sp`), e digitare cifre per
    // cercarlo è la ricerca a precedenza-codice della cella, non il tipo della
    // colonna. Restano solo le larghezze.
    vat: ['defaultWidthPx', 'minWidthPx'],
    discount: ['defaultWidthPx', 'minWidthPx'],
    lineTotal: ['defaultWidthPx', 'minWidthPx'],
    // ⭐ `sku`, `articleCode` e `barcode` NON compaiono qui: sono già identiche
    // in tutti i documenti che le dichiarano. Erano state elencate per
    // prudenza, e il test le ha smentite al primo giro — è il suo mestiere.
  };

  const COLONNE_DA_CONFRONTARE = [
    'articleCode',
    'sku',
    'barcode',
    'product',
    'quantity',
    'discount',
    'vat',
    'lineTotal',
  ] as const;

  /*
    ⚠️ **`filter` è entrata il 29/08/2026, e senza di lei la divergenza era muta.**

    I filtri di un elenco derivano dalle colonne (`14` §0.2): la forma del filtro
    è una proprietà della colonna come la larghezza, e due configurazioni che
    dichiarano la stessa colonna con forme diverse sono lo stesso difetto che
    questo file esiste per rendere visibile.
  */
  const PROPRIETA = [
    'label',
    'numeric',
    'defaultVisible',
    'defaultWidthPx',
    'minWidthPx',
    'filter',
  ] as const;

  const valore = (def: TableColumnDef, prop: (typeof PROPRIETA)[number]) => {
    if (prop === 'numeric') return def.numeric ?? false;
    if (prop === 'defaultVisible') return def.defaultVisible ?? true;
    // ⭐ Si confronta la forma EFFETTIVA, non quella dichiarata: `filter` è
    //    opt-out e quasi nessuna colonna lo scrive, quindi confrontare il campo
    //    nudo direbbe «uguali» su due colonne che il motore filtra in modi
    //    diversi — cioè il difetto passerebbe proprio dove sta.
    if (prop === 'filter') return resolveColumnFilterKind(def);
    return def[prop];
  };

  it('⭐ tutte le configurazioni sono state caricate', () => {
    // La guardia della guardia: se un import si rompesse, i test sotto
    // passerebbero confrontando insiemi vuoti.
    for (const [nome, defs] of CONFIGURAZIONI) {
      expect(defs.length, `${nome} non ha colonne`).toBeGreaterThan(3);
    }
  });

  for (const id of COLONNE_DA_CONFRONTARE) {
    for (const prop of PROPRIETA) {
      const tollerata = DIVERGENZE_NOTE[id]?.includes(prop) ?? false;

      it(`${tollerata ? '⏸️ [divergenza nota]' : '⛔'} «${id}» · ${prop}`, () => {
        const dichiarazioni = CONFIGURAZIONI.map(
          ([nome, defs]) => [nome, defs.find((d) => d.id === id)] as const,
        ).filter((coppia): coppia is readonly [string, TableColumnDef] => coppia[1] !== undefined);

        const valori = dichiarazioni.map(([nome, def]) => `${nome}=${String(valore(def, prop))}`);
        const distinti = new Set(dichiarazioni.map(([, def]) => String(valore(def, prop))));

        if (tollerata) {
          // Le divergenze note NON si asseriscono uguali: si asserisce che
          // esistano ancora. Il giorno in cui una viene risolta, questo test
          // fallisce e chiede di togliere la voce dall'elenco — così l'elenco
          // non sopravvive alla ragione per cui è nato.
          expect(
            distinti.size,
            `«${id}».${prop} NON diverge più: ${valori.join(' · ')}`,
          ).toBeGreaterThan(1);
          return;
        }

        expect(distinti.size, `«${id}».${prop} diverge — ${valori.join(' · ')}`).toBe(1);
      });
    }
  }
});
