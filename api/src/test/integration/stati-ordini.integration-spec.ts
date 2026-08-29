import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaClientIntegrazione } from './prisma';
import { creaDatasetStati, IDS_STATI as ID } from './stati-ordini.fixture';

/**
 * Passo 6A — gli stati dei due Ordini, provati **via HTTP su PostgreSQL vero**.
 *
 * ⭐ Ogni prova passa da `JwtAuthGuard` → controller → service → Prisma →
 *    PostgreSQL. Nessuna guardia sostituita: è l'unica forma che certifica che
 *    lo stato ARRIVI dal DTO alla colonna, e che gli effetti sugli impegni
 *    avvengano nella stessa transazione del salvataggio.
 */
/** I `count`/`sum` di Postgres arrivano come BigInt: JSON non li serializza. */
const sostituisciBigInt = (_k: string, v: unknown) => (typeof v === 'bigint' ? Number(v) : v);

describe('stati degli Ordini — integrazione HTTP su PostgreSQL TEST', () => {
  let app: AppIntegrazione;
  let prisma: PrismaClient;
  let token: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDatasetStati(prisma);
    app = await avviaApp();
    token = await app.token(ID.authOwner);
  }, 180_000);

  afterAll(async () => {
    await app?.chiudi();
    await prisma?.$disconnect();
  }, 60_000);

  const salvaCliente = async (corpo: Record<string, unknown>) =>
    chiama(app, 'POST', '/sales-orders/manual/save', {
      token,
      corpo: {
        customerId: ID.cliente,
        locationId: ID.sede,
        documentDate: '2026-08-01',
        lines: [
          { variantId: ID.variante, title: 'Articolo di prova', quantity: 2, commitsStock: true },
        ],
        ...corpo,
      },
    });

  const statoCliente = async (id: string): Promise<string | null> => {
    const r = await prisma.$queryRawUnsafe<{ s: string | null }[]>(
      `SELECT commercial_state::text AS s FROM sales_orders WHERE id = '${id}'`,
    );
    return r[0]?.s ?? null;
  };

  const impegniDi = async (id: string): Promise<number> => {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM stock_reservations
       WHERE sales_order_id = '${id}' AND status = 'active'`,
    );
    return Number(r[0]!.n);
  };

  // ═══ 1 · nascita ═════════════════════════════════════════════════════════
  describe('un ordine NUOVO nasce Confermato', () => {
    it('✅ Cliente senza stato dichiarato → confirmed, e impegna', async () => {
      const esito = await salvaCliente({});
      expect(esito.stato).toBe(201);

      const id = (esito.corpo as { order: { id: string } }).order.id;
      expect(await statoCliente(id)).toBe('confirmed');
      expect(await impegniDi(id)).toBe(1);
    });

    it('✅ Fornitore senza stato dichiarato → confirmed', async () => {
      const esito = await chiama(app, 'POST', '/supplier-orders', {
        token,
        corpo: {
          supplierId: ID.fornitore,
          destinationLocationId: ID.sede,
          lines: [{ variantId: ID.variante, orderedQuantity: 3, enteredUnitCostMinor: 1000 }],
        },
      });
      expect(esito.stato).toBe(201);
      expect((esito.corpo as { status: string }).status).toBe('confirmed');
    });
  });

  // ═══ 2 · «Da confermare» si sceglie, e si persiste ════════════════════════
  describe('«Da confermare» è una scelta esplicita', () => {
    it('✅ Cliente: to_confirm persistito, e NESSUN impegno', async () => {
      const esito = await salvaCliente({ status: 'to_confirm' });
      expect(esito.stato).toBe(201);

      const id = (esito.corpo as { order: { id: string } }).order.id;
      expect(await statoCliente(id)).toBe('to_confirm');
      // ⛔ Il contratto: «Da confermare» non impegna la merce.
      expect(await impegniDi(id)).toBe(0);
    });

    it('✅ Fornitore: to_confirm persistito', async () => {
      const esito = await chiama(app, 'POST', '/supplier-orders', {
        token,
        corpo: {
          supplierId: ID.fornitore,
          destinationLocationId: ID.sede,
          status: 'to_confirm',
          lines: [{ variantId: ID.variante, orderedQuantity: 1, enteredUnitCostMinor: 500 }],
        },
      });
      expect(esito.stato).toBe(201);
      expect((esito.corpo as { status: string }).status).toBe('to_confirm');
    });
  });

  // ═══ 3 · eleggibilità ════════════════════════════════════════════════════
  describe('solo Confermato è includibile', () => {
    const includibili = async (): Promise<string[]> => {
      const esito = await chiama(app, 'GET', '/sales-orders?includable=true&pageSize=100', {
        token,
      });
      const corpo = esito.corpo as { items: { id: string }[] };
      return corpo.items.map((o) => o.id);
    };

    it('⛔ to_confirm NON compare · ✅ confirmed compare', async () => {
      const daConfermare = (
        (await salvaCliente({ status: 'to_confirm' })).corpo as { order: { id: string } }
      ).order.id;
      const confermato = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;

      const elenco = await includibili();
      expect(elenco).toContain(confermato);
      expect(elenco).not.toContain(daConfermare);
    });

    it('⛔ cancelled NON compare', async () => {
      const id = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;
      await salvaCliente({ id, status: 'cancelled' });

      expect(await statoCliente(id)).toBe('cancelled');
      expect(await includibili()).not.toContain(id);
    });

    it('⛔ concluded NON compare', async () => {
      const id = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;
      // Lo stato Concluso è DERIVATO: non si passa dall'API, lo scrive il
      // collegamento. Qui si simula il solo effetto persistito.
      await prisma.$executeRawUnsafe(
        `UPDATE sales_orders SET commercial_state = 'concluded' WHERE id = '${id}'`,
      );

      expect(await includibili()).not.toContain(id);
    });
  });

  // ═══ 4 · gli impegni seguono lo stato, nella stessa transazione ═══════════
  describe('Cliente: confirmed ↔ to_confirm muove gli impegni', () => {
    let id = '';

    beforeEach(async () => {
      id = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;
    });

    it('confirmed → to_confirm: gli impegni si rilasciano', async () => {
      expect(await impegniDi(id)).toBe(1);

      await salvaCliente({ id, status: 'to_confirm' });

      expect(await statoCliente(id)).toBe('to_confirm');
      expect(await impegniDi(id)).toBe(0);
    });

    it('to_confirm → confirmed: gli impegni si ricreano', async () => {
      await salvaCliente({ id, status: 'to_confirm' });
      expect(await impegniDi(id)).toBe(0);

      await salvaCliente({ id, status: 'confirmed' });

      expect(await statoCliente(id)).toBe('confirmed');
      expect(await impegniDi(id)).toBe(1);
    });

    /**
     * ⛔ **`status` assente significa «non lo cambio».** Il default `confirmed`
     * appartiene alla CREAZIONE: applicarlo a ogni salvataggio riporterebbe a
     * Confermato un ordine che l'operatore aveva messo Da confermare.
     */
    it('⛔ risalvare SENZA status non riporta a Confermato', async () => {
      await salvaCliente({ id, status: 'to_confirm' });

      await salvaCliente({ id });

      expect(await statoCliente(id)).toBe('to_confirm');
      expect(await impegniDi(id)).toBe(0);
    });
  });

  // ═══ 5 · il Fornitore non tocca quantità ═════════════════════════════════
  describe('⛔ Fornitore: le stesse transizioni, ZERO effetti quantitativi', () => {
    it('to_confirm → confirmed → cancelled senza muovere nulla', async () => {
      const conta = async () => {
        const r = await prisma.$queryRawUnsafe<{ m: bigint; s: bigint; g: bigint; i: bigint }[]>(
          `SELECT (SELECT count(*) FROM stock_movements) AS m,
                  (SELECT count(*) FROM stock_reservations) AS s,
                  (SELECT coalesce(sum(on_hand), 0) FROM inventory_levels) AS g,
                  (SELECT coalesce(sum(committed), 0) FROM inventory_levels) AS i`,
        );
        return JSON.stringify(r[0], (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
      };

      const creato = await chiama(app, 'POST', '/supplier-orders', {
        token,
        corpo: {
          supplierId: ID.fornitore,
          destinationLocationId: ID.sede,
          status: 'to_confirm',
          lines: [{ variantId: ID.variante, orderedQuantity: 5, enteredUnitCostMinor: 1000 }],
        },
      });
      const id = (creato.corpo as { id: string }).id;
      const prima = await conta();

      // ⚠️ `lines` è obbligatorio nel PATCH fornitore: si rimandano identiche,
      //    perché qui si cambia solo lo stato.
      const aConfermato = await chiama(app, 'PATCH', `/supplier-orders/${id}`, {
        token,
        corpo: {
          status: 'confirmed',
          lines: [{ variantId: ID.variante, orderedQuantity: 5, enteredUnitCostMinor: 1000 }],
        },
      });
      expect(aConfermato.stato).toBe(200);
      expect((aConfermato.corpo as { status: string }).status).toBe('confirmed');

      const annullato = await chiama(app, 'POST', `/supplier-orders/${id}/cancel`, { token });
      expect(annullato.stato).toBe(201);
      expect((annullato.corpo as { status: string }).status).toBe('cancelled');

      // ⛔ Il cuore della prova: nessuna quantità si è mossa.
      expect(await conta()).toBe(prima);
    });
  });

  // ═══ 6 · «Concluso» non si sceglie a mano ════════════════════════════════
  describe('⛔ Concluso non è una transizione manuale', () => {
    it('il DTO Cliente non lo accetta nemmeno', async () => {
      const id = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;

      const esito = await salvaCliente({ id, status: 'concluded' });

      expect(esito.stato).toBe(400);
      expect(await statoCliente(id)).toBe('confirmed');
    });

    it('e nemmeno quello Fornitore', async () => {
      const esito = await chiama(app, 'POST', '/supplier-orders', {
        token,
        corpo: {
          supplierId: ID.fornitore,
          destinationLocationId: ID.sede,
          status: 'concluded',
          lines: [{ variantId: ID.variante, orderedQuantity: 1, enteredUnitCostMinor: 100 }],
        },
      });
      expect(esito.stato).toBe(400);
    });

    /**
     * ⭐ Da Concluso non si esce a mano: ci si esce annullando o eliminando il
     * documento collegato (`12` §0.4-bis).
     */
    it('⛔ da Concluso non si torna indietro col selettore', async () => {
      const id = ((await salvaCliente({})).corpo as { order: { id: string } }).order.id;
      await prisma.$executeRawUnsafe(
        `UPDATE sales_orders SET commercial_state = 'concluded' WHERE id = '${id}'`,
      );

      const esito = await salvaCliente({ id, status: 'to_confirm' });

      expect(esito.stato).toBe(409);
      expect(await statoCliente(id)).toBe('concluded');
    });
  });

  // ═══ 7 · gli ordini di canale restano fuori ══════════════════════════════
  it('⛔ un ordine di canale non prende uno stato commerciale', async () => {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM sales_orders
       WHERE source <> 'manual' AND commercial_state IS NOT NULL`,
    );
    expect(Number(r[0]!.n)).toBe(0);
  });

  // ═══ 8 · lo stato NON governa la modificabilità ══════════════════════════
  describe('⭐ Fornitore Concluso: modificabile in tutto, tranne lo Stato', () => {
    /** Crea un ordine, lo conclude agganciandogli un Arrivo merce vero. */
    const ordineConcluso = async (): Promise<{ id: string; arrivo: string; riga: string }> => {
      const creato = await chiama(app, 'POST', '/supplier-orders', {
        token,
        corpo: {
          supplierId: ID.fornitore,
          destinationLocationId: ID.sede,
          lines: [{ variantId: ID.variante, orderedQuantity: 4, enteredUnitCostMinor: 1000 }],
        },
      });
      const id = (creato.corpo as { id: string }).id;

      const arrivo = await chiama(app, 'POST', '/documents/goods-receipt/save', {
        token,
        corpo: {
          type: 'goods_receipt',
          documentDate: '2026-08-02',
          supplierId: ID.fornitore,
          locationId: ID.sede,
          supplierOrderId: id,
          lines: [
            { variantId: ID.variante, description: 'Articolo di prova', quantity: 4, loadsStock: true },
          ],
        },
      });
      expect(arrivo.stato, JSON.stringify(arrivo.corpo).slice(0, 200)).toBe(201);

      const stato = await prisma.$queryRawUnsafe<{ s: string }[]>(
        `SELECT status::text AS s FROM supplier_orders WHERE id = '${id}'`,
      );
      expect(stato[0]!.s, 'l’Arrivo merce collegato deve concludere l’ordine').toBe('concluded');

      // L’identità della riga: è quella che un client vero rimanda al
      // salvataggio successivo, ed è ciò che distingue «modifico questa riga»
      // da «ho tolto quella e ne ho messa un’altra».
      const righe = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM supplier_order_lines WHERE order_id = '${id}'`,
      );
      return {
        id,
        arrivo: (arrivo.corpo as { document: { id: string } }).document.id,
        riga: righe[0]!.id,
      };
    };

    const modifica = (id: string, corpo: Record<string, unknown>) =>
      chiama(app, 'PATCH', `/supplier-orders/${id}`, {
        token,
        corpo: {
          lines: [{ variantId: ID.variante, orderedQuantity: 4, enteredUnitCostMinor: 1000 }],
          ...corpo,
        },
      });

    it('✅ Concluso + modifica di un campo ORDINARIO: consentita', async () => {
      const { id } = await ordineConcluso();

      const esito = await modifica(id, { supplierReference: 'RIF-NUOVO' });

      expect(esito.stato).toBe(200);
      expect((esito.corpo as { supplierReference: string }).supplierReference).toBe('RIF-NUOVO');
      // Lo stato non si muove: la modifica non è una transizione.
      expect((esito.corpo as { status: string }).status).toBe('concluded');
    });

    it('✅ Concluso + modifica delle RIGHE: consentita', async () => {
      const { id } = await ordineConcluso();

      const esito = await modifica(id, {
        lines: [{ variantId: ID.variante, orderedQuantity: 9, enteredUnitCostMinor: 1500 }],
      });

      expect(esito.stato).toBe(200);
      const righe = await prisma.$queryRawUnsafe<{ q: number }[]>(
        `SELECT ordered_quantity AS q FROM supplier_order_lines WHERE order_id = '${id}'`,
      );
      expect(righe.map((r) => Number(r.q))).toEqual([9]);
    });

    /**
     * ⛔ **L'unica eccezione.** Il campo Stato è bloccato: da Concluso si esce
     * annullando o eliminando l'Arrivo merce, non col selettore.
     */
    it.each(['confirmed', 'to_confirm', 'cancelled'])(
      '⛔ Concluso + cambio status a %s: RIFIUTATO',
      async (status) => {
        const { id } = await ordineConcluso();

        const esito = await modifica(id, { status });

        expect(esito.stato).toBe(409);
        const dopo = await prisma.$queryRawUnsafe<{ s: string }[]>(
          `SELECT status::text AS s FROM supplier_orders WHERE id = '${id}'`,
        );
        expect(dopo[0]!.s).toBe('concluded');
      },
    );

    /**
     * ⭐ **L'Arrivo merce è uno snapshot autonomo**: modificare l'ordine dopo la
     * conclusione non deve aggiornarlo né riscriverlo.
     */
    it('⭐ l’Arrivo merce collegato resta INVARIATO dopo la modifica dell’ordine', async () => {
      const { id, arrivo, riga } = await ordineConcluso();

      const prima = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT d.id, d.number, d.total_minor, d.supplier_order_id,
                (SELECT count(*) FROM document_lines WHERE document_id = d.id) AS righe,
                (SELECT coalesce(sum(quantity), 0) FROM document_lines WHERE document_id = d.id) AS qta,
                (SELECT coalesce(sum(entered_unit_cost), 0) FROM document_lines WHERE document_id = d.id) AS costi,
                (SELECT count(*) FROM document_lines WHERE document_id = d.id AND supplier_order_line_id IS NOT NULL) AS collegate
         FROM documents d WHERE d.id = '${arrivo}'`,
      );

      // ⚠️ La riga porta il proprio `id`: è la stessa riga che cambia valori,
      //    non una riga tolta e una rimessa. Senza l’id il server leggerebbe
      //    «cancella quella e creane una nuova» — che è un’altra operazione, ed
      //    è quella provata più sotto.
      await modifica(id, {
        supplierReference: 'RIF-DOPO',
        lines: [
          { id: riga, variantId: ID.variante, orderedQuantity: 99, enteredUnitCostMinor: 4200 },
        ],
      });

      const dopo = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT d.id, d.number, d.total_minor, d.supplier_order_id,
                (SELECT count(*) FROM document_lines WHERE document_id = d.id) AS righe,
                (SELECT coalesce(sum(quantity), 0) FROM document_lines WHERE document_id = d.id) AS qta,
                (SELECT coalesce(sum(entered_unit_cost), 0) FROM document_lines WHERE document_id = d.id) AS costi,
                (SELECT count(*) FROM document_lines WHERE document_id = d.id AND supplier_order_line_id IS NOT NULL) AS collegate
         FROM documents d WHERE d.id = '${arrivo}'`,
      );

      expect(JSON.stringify(dopo, sostituisciBigInt)).toBe(JSON.stringify(prima, sostituisciBigInt));
    });

    /**
     * ⚠️ **E i movimenti di magazzino dell'Arrivo merce non si toccano.** Sono
     * l'effetto del DOCUMENTO, non dell'ordine: l'ordine fornitore non muove
     * mai il magazzino, in nessuno stato (`17` §1).
     */
    it('⛔ e nessun movimento di magazzino cambia', async () => {
      const { id } = await ordineConcluso();
      const conta = async () => {
        const r = await prisma.$queryRawUnsafe<{ n: bigint; q: bigint }[]>(
          `SELECT count(*) AS n, coalesce(sum(quantity), 0) AS q FROM stock_movements`,
        );
        return `${Number(r[0]!.n)}/${Number(r[0]!.q)}`;
      };
      const prima = await conta();

      await modifica(id, {
        lines: [{ variantId: ID.variante, orderedQuantity: 50, enteredUnitCostMinor: 9999 }],
      });

      expect(await conta()).toBe(prima);
    });

  /**
   * ⭐ **Le righe conservano la loro identità** — 29/08/2026.
   *
   * Il salvataggio dell'Ordine fornitore era `deleteMany` + ricrea: le righe
   * rinascevano con id nuovi a **ogni** salvataggio, anche senza modifiche, e
   * con loro si staccava il Ricevuto (che tornava a 0) e il legame dell'Arrivo
   * merce (`supplier_order_line_id`, `onDelete: SetNull`).
   *
   * Le cinque prove qui sotto sono i cinque comportamenti richiesti, uno per
   * `it`, misurati sulle colonne e non sulla risposta HTTP.
   */
  describe('⭐ le righe dell’Ordine fornitore conservano la loro identità', () => {
    /** Riga, quantità ordinata, ricevuto e legami dell'Arrivo merce. */
    const foto = async (ordine: string, arrivo: string) => {
      const righe = await prisma.$queryRawUnsafe<
        { id: string; variant_id: string; ordered_quantity: number; received_quantity: number }[]
      >(
        `SELECT id, variant_id, ordered_quantity, received_quantity
         FROM supplier_order_lines WHERE order_id = '${ordine}' ORDER BY line_number`,
      );
      const doc = await prisma.$queryRawUnsafe<{ righe: bigint; qta: string; collegate: bigint }[]>(
        `SELECT count(*) AS righe, coalesce(sum(quantity), 0)::text AS qta,
                count(*) FILTER (WHERE supplier_order_line_id IS NOT NULL) AS collegate
         FROM document_lines WHERE document_id = '${arrivo}'`,
      );
      return { righe, arrivo: doc[0]! };
    };

    it('✅ salva SENZA modifiche: non perde né il Ricevuto né i collegamenti', async () => {
      const { id, arrivo, riga } = await ordineConcluso();
      const prima = await foto(id, arrivo);
      expect(Number(prima.righe[0]!.received_quantity), 'l’Arrivo merce ha caricato 4').toBe(4);
      expect(Number(prima.arrivo.collegate), 'la riga dell’Arrivo è agganciata').toBe(1);

      await modifica(id, {
        lines: [{ id: riga, variantId: ID.variante, orderedQuantity: 4, enteredUnitCostMinor: 1000 }],
      });

      const dopo = await foto(id, arrivo);
      expect(dopo.righe[0]!.id, 'la riga è la STESSA riga').toBe(riga);
      expect(Number(dopo.righe[0]!.received_quantity), 'il Ricevuto resta').toBe(4);
      expect(Number(dopo.arrivo.collegate), 'il legame regge').toBe(1);
    });

    it('✅ sostituzione dell’articolo sulla STESSA riga: quantità e Ricevuto invariati', async () => {
      const { id, arrivo, riga } = await ordineConcluso();

      // Stessa riga, articolo diverso: il client rimanda l'id e la quantità che
      // ha letto, perché l'operatore non l'ha toccata.
      await modifica(id, {
        lines: [{ id: riga, variantId: ID.varianteB, orderedQuantity: 4, enteredUnitCostMinor: 1000 }],
      });

      const dopo = await foto(id, arrivo);
      expect(dopo.righe.length).toBe(1);
      expect(dopo.righe[0]!.id, 'non è una riga nuova: è la stessa').toBe(riga);
      expect(dopo.righe[0]!.variant_id, 'l’articolo è cambiato').toBe(ID.varianteB);
      expect(Number(dopo.righe[0]!.ordered_quantity), 'la quantità non si è mossa').toBe(4);
      expect(Number(dopo.righe[0]!.received_quantity), 'e nemmeno il Ricevuto').toBe(4);
      expect(Number(dopo.arrivo.collegate), 'il legame regge').toBe(1);
    });

    it('✅ riga eliminata: eliminazione REALE, e l’Arrivo merce resta con le sue righe', async () => {
      const { id, arrivo } = await ordineConcluso();

      // Nessuna riga inviata = l'operatore le ha tolte davvero.
      const esito = await modifica(id, { lines: [] });
      expect(esito.stato).toBe(200);

      const dopo = await foto(id, arrivo);
      expect(dopo.righe.length, 'la riga è finita').toBe(0);
      // ⭐ L'Arrivo merce non si tocca: tiene le sue righe e le sue quantità.
      //    Perde solo il puntatore a una riga che non esiste più — è il
      //    `onDelete: SetNull` dello schema, non una riscrittura del documento.
      expect(Number(dopo.arrivo.righe), 'l’Arrivo merce tiene la sua riga').toBe(1);
      expect(Number(dopo.arrivo.qta), 'e la sua quantità').toBe(4);
      expect(Number(dopo.arrivo.collegate), 'il puntatore alla riga sparita cade').toBe(0);
    });

    it('✅ articolo aggiunto dopo: riga NUOVA, che non eredita niente', async () => {
      const { id, arrivo, riga } = await ordineConcluso();

      await modifica(id, {
        lines: [
          { id: riga, variantId: ID.variante, orderedQuantity: 4, enteredUnitCostMinor: 1000 },
          { variantId: ID.varianteB, orderedQuantity: 7, enteredUnitCostMinor: 2000 },
        ],
      });

      const dopo = await foto(id, arrivo);
      expect(dopo.righe.length).toBe(2);
      expect(dopo.righe[0]!.id, 'la prima è quella di prima').toBe(riga);
      expect(Number(dopo.righe[0]!.received_quantity), 'col suo Ricevuto').toBe(4);
      expect(dopo.righe[1]!.id, 'la seconda è un’altra riga').not.toBe(riga);
      expect(Number(dopo.righe[1]!.received_quantity), 'e non eredita nessun Ricevuto').toBe(0);
    });

    it('⛔ un id di riga che non appartiene all’ordine: 422, e niente scritto', async () => {
      const { id, riga } = await ordineConcluso();
      const estraneo = '00000000-0000-4000-8000-0000000000ff';

      const esito = await modifica(id, {
        lines: [{ id: estraneo, variantId: ID.variante, orderedQuantity: 4, enteredUnitCostMinor: 1000 }],
      });

      expect(esito.stato).toBe(422);
      const righe = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM supplier_order_lines WHERE order_id = '${id}'`,
      );
      expect(righe.map((r) => r.id), 'la riga vera è ancora lì, intatta').toEqual([riga]);
    });
  });
  });

});
