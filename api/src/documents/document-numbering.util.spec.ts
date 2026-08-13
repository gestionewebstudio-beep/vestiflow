import { DocumentType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildDocumentNumberConflict,
  defaultCounterSeries,
  isDocumentNumberConflict,
  lastAssignedNumber,
} from './document-numbering.util';

/**
 * Tx finto: il massimo della serie, più il secondo passo della regola del §2.
 *
 * `$queryRaw` restituisce il primo libero. Senza buchi coincide con `m + 1`, ed
 * è il caso di tutti i test di questo file: qui si verifica il MESSAGGIO del
 * conflitto, non la ricerca del buco — quella ha i suoi test più sotto.
 */
function fakeTx(maxNumber: number | null, primoLibero?: number): Prisma.TransactionClient {
  return {
    document: { aggregate: vi.fn().mockResolvedValue({ _max: { number: maxNumber } }) },
    $queryRaw: vi.fn().mockResolvedValue([{ libero: primoLibero ?? (maxNumber ?? 0) + 1 }]),
  } as unknown as Prisma.TransactionClient;
}

function conflictFor(options: {
  readonly maxNumber: number | null;
  readonly requestedNumber?: number | null;
  readonly series?: string | null;
}) {
  return buildDocumentNumberConflict({
    tx: fakeTx(options.maxNumber),
    tenantId: 'tenant-1',
    type: DocumentType.goods_receipt,
    // `??` non va: `null` è un valore VOLUTO (la serie vuota) e verrebbe
    // scambiato per «non passato», facendo passare il test sulla serie 'A'.
    series: 'series' in options ? (options.series ?? null) : 'A',
    source: 'document',
    prefix: 'AM',
    requestedNumber: options.requestedNumber,
  });
}

/**
 * **La sede vale in assegnazione, non solo nella tendina** (specifica
 * numerazione §1-bis).
 *
 * Il difetto che questi test chiudono: la tendina filtrava i contatori sulla
 * sede, l'assegnazione no. Con NAP legato a Napoli e marcato predefinito, un
 * operatore di Milano — a cui NAP non era nemmeno stato mostrato — salvava un
 * documento con serie NAP. La tendina diceva il vero, il salvataggio no.
 */
/**
 * **La proposta per data** (specifica numerazione §2).
 *
 * Il primo passo — **m**, il massimo fra i documenti di data anteriore — è un
 * aggregato Prisma, e si verifica sul `where` che riceve: è la parte che dice
 * *quali* documenti entrano nel conto, ed è dove la regola può sbagliare in
 * modo silenzioso (prendere anche quelli di oggi, o dell'intera serie).
 */
describe('lastAssignedNumber — il filtro per data', () => {
  function txConAggregato() {
    const aggregate = vi.fn().mockResolvedValue({ _max: { number: 10 } });
    return {
      aggregate,
      tx: { document: { aggregate } } as unknown as Prisma.TransactionClient,
    };
  }

  it('conta solo i documenti di un giorno PRECEDENTE, non quelli di oggi', async () => {
    const { tx, aggregate } = txConAggregato();

    await lastAssignedNumber({
      tx,
      tenantId: 'tenant-1',
      type: DocumentType.goods_receipt,
      series: 'A',
      source: 'document',
      documentDate: new Date('2026-06-05'),
    });

    // `lt` e non `lte`: i documenti dello stesso giorno restano fuori: è ciò che
    // permette di tappare un buco fra due documenti di pari data senza creare
    // un'anomalia cronologica.
    expect(aggregate.mock.calls[0]![0].where).toMatchObject({
      documentDate: { lt: new Date('2026-06-05T00:00:00.000Z') },
    });
  });

  // La colonna «prossimo numero» dei Numeratori non ha una data del documento e
  // non può averla: mostra il primo libero a partire da OGGI, così coincide con
  // quello che l'operatore vedrà aprendo un documento due secondi dopo.
  it('senza data il confine è la mezzanotte di oggi, non l’istante', async () => {
    const { tx, aggregate } = txConAggregato();

    await lastAssignedNumber({
      tx,
      tenantId: 'tenant-1',
      type: DocumentType.goods_receipt,
      series: null,
      source: 'document',
    });

    const confine = (aggregate.mock.calls[0]![0].where as { documentDate: { lt: Date } })
      .documentDate.lt;
    expect(confine.getUTCHours()).toBe(0);
    expect(confine.getUTCMinutes()).toBe(0);
    expect(confine.getUTCSeconds()).toBe(0);
    expect(confine.getUTCMilliseconds()).toBe(0);
  });
});

describe('defaultCounterSeries', () => {
  /** Tx finto: qui serve solo l'elenco dei contatori che la query restituisce. */
  function txConContatori(
    counters: readonly { series: string | null; isDefault: boolean }[],
  ): Prisma.TransactionClient {
    return {
      documentCounter: { findMany: vi.fn().mockResolvedValue(counters) },
    } as unknown as Prisma.TransactionClient;
  }

  it('usa il predefinito quando è disponibile per la sede', async () => {
    const tx = txConContatori([
      { series: 'NAP', isDefault: true },
      { series: null, isDefault: false },
    ]);

    await expect(
      defaultCounterSeries(tx, 'tenant-1', DocumentType.goods_receipt, 'loc-napoli'),
    ).resolves.toBe('NAP');
  });

  // Il predefinito è di un'altra sede: la query non lo restituisce affatto, e
  // resta un solo contatore disponibile — quello vale, perché la scelta è obbligata.
  it('predefinito incompatibile e un solo contatore disponibile: prende quello', async () => {
    const tx = txConContatori([{ series: null, isDefault: false }]);

    await expect(
      defaultCounterSeries(tx, 'tenant-1', DocumentType.goods_receipt, 'loc-milano'),
    ).resolves.toBeNull();
  });

  // Più contatori disponibili e nessuno predefinito fra loro: la scelta non è
  // nostra. Nessuna serie, e la sceglie l'operatore in testata.
  it('predefinito incompatibile e più contatori disponibili: nessuna serie', async () => {
    const tx = txConContatori([
      { series: 'MI', isDefault: false },
      { series: null, isDefault: false },
    ]);

    await expect(
      defaultCounterSeries(tx, 'tenant-1', DocumentType.goods_receipt, 'loc-milano'),
    ).resolves.toBeNull();
  });

  it('senza sede restano i soli contatori senza sede', async () => {
    const findMany = vi.fn().mockResolvedValue([{ series: null, isDefault: true }]);
    const tx = { documentCounter: { findMany } } as unknown as Prisma.TransactionClient;

    await defaultCounterSeries(tx, 'tenant-1', DocumentType.goods_receipt, null);

    // Il filtro chiesto al database è la regola stessa: nessun ramo per la
    // sede quando la sede non c'è.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ locationId: null }] }),
      }),
    );
  });

  it('con una sede chiede quella sede più i contatori senza sede', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = { documentCounter: { findMany } } as unknown as Prisma.TransactionClient;

    await defaultCounterSeries(tx, 'tenant-1', DocumentType.goods_receipt, 'loc-napoli');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ locationId: null }, { locationId: 'loc-napoli' }],
        }),
      }),
    );
  });
});

describe('buildDocumentNumberConflict', () => {
  /**
   * Il difetto che questi test bloccano: il payload dichiarava sempre
   * `nextAvailable - 1`, cioè l'ultimo numero occupato della serie. Da quando
   * la maschera non rimanda più indietro la propria proposta, questo conflitto
   * si raggiunge SOLO digitando un numero a mano — e in quel caso i due numeri
   * non coincidono affatto.
   *
   * Serie fino a 43, il 7 è un buco: l'operatore digita 7 per tapparlo, un
   * collega lo prende un istante prima. Il conflitto deve parlare del 7.
   */
  it('riporta il numero richiesto, non l’ultimo occupato della serie', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: 7 });

    expect(conflict.number).toBe(7);
    expect(conflict.nextAvailable).toBe(44);
    expect(conflict.code).toBe('document_number_taken');
    expect(conflict.series).toBe('A');
  });

  it('il numero richiesto non sposta il primo libero della serie', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: 200 });

    expect(conflict.number).toBe(200);
    expect(conflict.nextAvailable).toBe(44);
  });

  /**
   * Numero assegnato d'ufficio (nessuna richiesta): il chiamante non sa quale
   * numero la transazione avesse calcolato — è andato perso col rollback.
   *
   * Qui il ripiego era `nextAvailable - 1`, e la motivazione era «il server
   * aveva preso massimo + 1, qualcuno l'ha bruciato, quindi ora quel numero È
   * il massimo». Vera fino alla regola del §2, **falsa da quando la proposta è
   * il primo libero sopra i documenti di data anteriore**: su una serie con
   * buchi `nextAvailable` è il buco, e «il buco meno uno» è un numero che con
   * la collisione non c'entra niente. Non se ne nomina nessuno.
   */
  it('senza numero richiesto non inventa il numero rifiutato', async () => {
    const conflict = await conflictFor({ maxNumber: 43, requestedNumber: null });

    expect(conflict.number).toBeNull();
    expect(conflict.nextAvailable).toBe(44);
  });

  it('numero richiesto assente o non valido: stesso silenzio', async () => {
    await expect(conflictFor({ maxNumber: 43 })).resolves.toMatchObject({ number: null });
    await expect(conflictFor({ maxNumber: 43, requestedNumber: 0 })).resolves.toMatchObject({
      number: null,
    });
  });

  it('serie vuota: il payload la riporta come null', async () => {
    const conflict = await conflictFor({ maxNumber: 6, requestedNumber: 3, series: null });

    expect(conflict.series).toBeNull();
    expect(conflict.number).toBe(3);
    expect(conflict.nextAvailable).toBe(7);
  });

  it('serie senza documenti: il primo libero è 1', async () => {
    const conflict = await conflictFor({ maxNumber: null, requestedNumber: 5 });

    expect(conflict.number).toBe(5);
    expect(conflict.nextAvailable).toBe(1);
  });
});

/**
 * **Il riconoscimento non deve dipendere da come è scritto l'indice.**
 *
 * L'11/08/2026 l'indice unico dei documenti è diventato di ESPRESSIONE, per far
 * condividere il numeratore a Fattura e Accompagnatoria. Prisma ha smesso di
 * elencarne le colonne, il riconoscimento che cercava la parola «number» ha
 * smesso di funzionare, e per due giorni ogni conflitto di numero è uscito come
 * **500** invece che come avviso — su fatture, DDT, preventivi e proforma.
 *
 * Queste prove parlano della regola: si riconosce dal MODELLO. La forma
 * dell'indice può cambiare ancora senza portarsi dietro il meccanismo del §3.
 */
describe('isDocumentNumberConflict', () => {
  it('riconosce la violazione del vincolo unico sul numero', () => {
    const error = {
      code: 'P2002',
      meta: { modelName: 'Document', target: ['tenantId', 'type', 'series', 'number'] },
    };

    expect(isDocumentNumberConflict(error)).toBe(true);
  });

  /**
   * ⚠️ La prova che sarebbe servita l'11 agosto. Questo `target` è quello VERO,
   * copiato da una violazione riprodotta sul database del progetto: Prisma non
   * sa nominare l'espressione e lascia una virgola orfana. La parola «number»
   * non compare da nessuna parte.
   */
  it('riconosce il conflitto anche quando l’indice è di ESPRESSIONE e le colonne sono illeggibili', () => {
    const error = { code: 'P2002', meta: { modelName: 'Document', target: ['tenant_id,'] } };

    expect(isDocumentNumberConflict(error)).toBe(true);
  });

  // Gli ordini portano il numero in tabelle proprie: stessa regola.
  it('vale anche per ordini cliente e ordini fornitore', () => {
    expect(isDocumentNumberConflict({ code: 'P2002', meta: { modelName: 'SalesOrder' } })).toBe(
      true,
    );
    expect(isDocumentNumberConflict({ code: 'P2002', meta: { modelName: 'SupplierOrder' } })).toBe(
      true,
    );
  });

  /**
   * Il salvataggio di un Arrivo merce può creare articoli nella stessa
   * transazione: uno SKU duplicato è un P2002 su un ALTRO modello, e non deve
   * diventare «numero già assegnato» — sarebbe un avviso che mente.
   */
  it('non scambia per conflitto di numero le unicità di altri modelli', () => {
    expect(
      isDocumentNumberConflict({
        code: 'P2002',
        meta: { modelName: 'ProductVariant', target: ['tenantId', 'sku'] },
      }),
    ).toBe(false);
  });

  it('ignora gli altri errori', () => {
    expect(isDocumentNumberConflict({ code: 'P2025' })).toBe(false);
    expect(isDocumentNumberConflict({ code: 'P2002' })).toBe(false);
    expect(isDocumentNumberConflict(null)).toBe(false);
    expect(isDocumentNumberConflict('boom')).toBe(false);
  });
});
