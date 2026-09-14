import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type {
  ShopifyInventoryPushResult,
  ShopifyInventoryPushService,
} from './shopify-inventory-push.service';
import { ShopifyInventoryRepublishService } from './shopify-inventory-republish.service';

const tenantId = 'tenant-1';

/**
 * Righe in coda per **disallineamento osservato**.
 *
 * ⚠️ **`mismatchDetected` fa parte della `select` vera**, e non è decorativo: è
 *    ciò che decide la porta — recupero per un disallineamento, push ordinario
 *    per un aggiornamento locale non trasmesso. Un doppio che lo omettesse
 *    manderebbe tutto dalla porta sbagliata, e la prova misurerebbe il doppio.
 */
function pending(quanti: number) {
  return Array.from({ length: quanti }, (_, index) => ({
    variantId: `var-${index}`,
    locationId: 'loc-1',
    mismatchDetected: true,
  }));
}

/** Righe in coda per **aggiornamento locale non trasmesso** (`localPushPending`). */
function pendentiLocali(quanti: number) {
  return Array.from({ length: quanti }, (_, index) => ({
    variantId: `var-loc-${index}`,
    locationId: 'loc-1',
    mismatchDetected: false,
  }));
}

/**
 * ⛔ **`ripubblicaDisallineamento` restituisce un ESITO, non `undefined`.** La stesura
 *    precedente lo simulava con `mockResolvedValue(undefined)` e col rifiuto
 *    come eccezione: due cose che il servizio vero non fa mai — cattura i propri
 *    errori e restituisce sempre un oggetto. Un finto che si comporta
 *    diversamente dall'originale fa passare prove che l'originale non
 *    supererebbe, ed è esattamente come il difetto degli esiti era sopravvissuto.
 */
function esitoPush(
  overrides: Partial<ShopifyInventoryPushResult> = {},
): ShopifyInventoryPushResult {
  return { pushed: true, publishableAvailable: 5, ...overrides };
}

function setup(
  options: {
    readonly rows?: readonly unknown[];
    /** L'esito che il push restituisce, per ogni riga in ordine. */
    readonly esiti?: readonly ShopifyInventoryPushResult[];
    /** Il push SOLLEVA, invece di restituire: caso raro ma possibile. */
    readonly pushSolleva?: boolean;
    /** L'esito deciso dalla RIGA: serve alle prove su più passate. */
    readonly esitoPerRiga?: (variantId: string) => ShopifyInventoryPushResult;
  } = {},
) {
  const rows = options.rows ?? [];
  // ⭐ Il marcatore si spegne solo per un invio riuscito: la riconta finale
  //    deve rifletterlo, o la prova misurerebbe un database che non esiste.
  let riusciti = 0;
  let chiamate = 0;

  // ⛔ **Il doppio deve modellare l'ORDINAMENTO e la MARCATURA, o non prova
  //    niente.** La coda ruota perché `lastAttemptAt` si scrive prima di ogni
  //    tentativo: un doppio che ignorasse quella scrittura restituirebbe sempre
  //    la stessa testa, e il difetto sarebbe del banco.
  //
  // ⚠️ `null` = mai esaminata, e va in TESTA: è l'ordine che il servizio chiede
  //    (`nulls: 'first'`).
  const marcatura = new Map<string, number>();
  const chiave = (r: { variantId: string; locationId: string }) => `${r.variantId}@${r.locationId}`;
  let orologio = 0;

  const prisma = {
    shopifyInventorySyncState: {
      count: vi.fn(() => Promise.resolve(rows.length - riusciti)),
      findMany: vi.fn((args: { take: number }) => {
        const ordinate = [...(rows as { variantId: string; locationId: string }[])].sort((a, b) => {
          const ma = marcatura.get(chiave(a));
          const mb = marcatura.get(chiave(b));
          if (ma === undefined && mb === undefined) return 0;
          if (ma === undefined) return -1;
          if (mb === undefined) return 1;
          return ma - mb;
        });
        return Promise.resolve(ordinate.slice(0, args.take));
      }),
      updateMany: vi.fn(
        (args: { where: { variantId: string; locationId: string }; data: unknown }) => {
          orologio += 1;
          marcatura.set(chiave(args.where), orologio);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  const rispondi = (_tenant: string, variantId: string) => {
    if (options.pushSolleva) {
      return Promise.reject(new Error('Shopify non raggiungibile'));
    }
    // ⭐ **Per RIGA, non per ordine di chiamata**: su più passate l'ordine
    //    cambia (è il punto), quindi un esito indicizzato sul contatore
    //    misurerebbe la sequenza invece del comportamento.
    const esito = options.esitoPerRiga?.(variantId) ?? options.esiti?.[chiamate] ?? esitoPush();
    chiamate += 1;
    if (esito.pushed) {
      riusciti += 1;
    }
    return Promise.resolve(esito);
  };
  const inventoryPush = {
    /**
     * ⭐ **La porta di RECUPERO**, per le righe con un disallineamento
     *    osservato: è l'unica che supera la scorciatoia dell'«invariata».
     */
    ripubblicaDisallineamento: vi.fn(rispondi),
    /**
     * ⭐ **La porta ORDINARIA**, per le righe che portano solo un aggiornamento
     *    locale non trasmesso. ⚠️ I due doppi condividono i contatori: quale
     *    delle due venga chiamata è ciò che le prove misurano, e il conteggio
     *    finale non deve dipendere dalla scelta.
     */
    pushLevel: vi.fn(rispondi),
  };
  const service = new ShopifyInventoryRepublishService(
    prisma as unknown as PrismaService,
    inventoryPush as unknown as ShopifyInventoryPushService,
  );
  return { service, prisma, inventoryPush };
}

/**
 * La rete di recupero della riconciliazione inventario.
 *
 * ⛔ **Le attese sono cambiate il 09/09/2026.** Prima l'esito aveva un campo
 *    solo, `succeeded`, e contava ogni chiamata che non avesse sollevato: poiché
 *    `pushLevel` non solleva mai, contava come riuscite anche le righe per cui
 *    non era partito niente. Ora le classi sono quattro e la riuscita è **un
 *    invio confermato**.
 */
describe('ShopifyInventoryRepublishService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('senza disallineamenti non chiama Shopify', async () => {
    const { service, inventoryPush } = setup();

    const result = await service.retryPending(tenantId);

    expect(result).toEqual({
      pending: 0,
      attempted: 0,
      republished: 0,
      unchanged: 0,
      refused: 0,
      failed: 0,
      remaining: 0,
    });
    expect(inventoryPush.ripubblicaDisallineamento).not.toHaveBeenCalled();
  });

  // Il controllo inverso: senza, il test qui sopra passerebbe anche se il
  // servizio non ripubblicasse mai niente.
  it('con disallineamenti in coda li ripubblica e svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ pending: 3, attempted: 3, republished: 3, remaining: 0 });
  });

  it('⛔ un invio NON effettuato non è una riuscita', async () => {
    // È il caso canonico del disallineamento: il push non ha niente da mandare
    // perché l'ultimo inviato coincide col disponibile.
    const { service } = setup({
      rows: pending(2),
      esiti: [
        { pushed: false, reason: 'unchanged', publishableAvailable: 5 },
        { pushed: false, reason: 'unchanged', publishableAvailable: 5 },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ attempted: 2, republished: 0, unchanged: 2, remaining: 2 });
  });

  it('⛔ un collegamento ESCLUSO è un rifiuto, non un fallimento e non una riuscita', async () => {
    const { service } = setup({
      rows: pending(1),
      esiti: [{ pushed: false, reason: 'collegamento_escluso', publishableAvailable: 5 }],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ republished: 0, refused: 1, failed: 0, remaining: 1 });
  });

  it('un errore del canale è un fallimento, e non svuota la coda', async () => {
    const { service } = setup({
      rows: pending(3),
      esiti: [
        { pushed: false, reason: 'shopify_error' },
        { pushed: false, reason: 'shopify_error' },
        { pushed: false, reason: 'shopify_error' },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({ attempted: 3, republished: 0, failed: 3, remaining: 3 });
  });

  // Un fallimento non deve fermare gli altri: sono righe indipendenti, e
  // recuperarne nove su dieci è meglio che nessuna.
  it('se il push SOLLEVA, tenta comunque tutte le righe e non svuota la coda', async () => {
    const { service, inventoryPush } = setup({ rows: pending(3), pushSolleva: true });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ attempted: 3, republished: 0, failed: 3, remaining: 3 });
  });

  it('un RINVIO in corso è «nessun invio», non una riuscita e non un errore', async () => {
    // ⚠️ Il rinvio non ha una classe sua — è una scelta dichiarata nel contratto
    //    dell'esito — ma non deve travestirsi da riuscita né da guasto: chi
    //    legge non deve andare a cercare un errore che non c'è.
    const { service } = setup({
      rows: pending(1),
      esiti: [{ pushed: false, reason: 'rinvio_attivo', publishableAvailable: 5 }],
    });

    const result = await service.retryPending(tenantId);

    expect(result).toMatchObject({
      attempted: 1,
      republished: 0,
      unchanged: 1,
      refused: 0,
      failed: 0,
      remaining: 1,
    });
  });

  it('⭐ lotto MISTO: le quattro classi sommano il tentato', async () => {
    const { service } = setup({
      rows: pending(4),
      esiti: [
        esitoPush(),
        { pushed: false, reason: 'unchanged' },
        { pushed: false, reason: 'collegamento_escluso' },
        { pushed: false, reason: 'shopify_error' },
      ],
    });

    const result = await service.retryPending(tenantId);

    expect(result.republished + result.unchanged + result.refused + result.failed).toBe(
      result.attempted,
    );
    expect(result).toMatchObject({ republished: 1, unchanged: 1, refused: 1, failed: 1 });
  });

  // L'Admin API e' a quota: una coda lunga svuotata tutta insieme se la mangia.
  // Ma quello che resta va DETTO — un tetto silenzioso si legge come «ho finito».
  it('oltre il tetto ne tenta una parte, e dichiara quanti restano', async () => {
    const { service, prisma, inventoryPush } = setup({ rows: pending(120) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ pending: 120, attempted: 50, republished: 50, remaining: 70 });
    // ⭐ **Le MENO RECENTEMENTE esaminate per prime, mai esaminate in testa.**
    //    ⛔ Non `updatedAt`: quello non si muove per le righe che escono senza
    //    scrivere, e la coda non ruoterebbe (vedi la prova sulle 220 bloccate).
    // ⛔ **Il secondo criterio non è decorativo**: le righe mai esaminate hanno
    //    tutte `lastAttemptAt` NULL, e fra chiavi uguali SQL non promette
    //    nessun ordine. `createdAt` lo fissa — e fra due che aspettano, parte
    //    quella che aspetta da più tempo. Prova su database vero in
    //    `coda-ripubblicazione.integration-spec.ts`.
    // ⛔ **E nemmeno `createdAt` è unico**: `@default(now())` è l'istante della
    //    TRANSAZIONE, quindi tutte le righe create insieme lo condividono.
    //    L'ordine si chiude sulla chiave primaria, dove un pareggio non può
    //    esistere per costruzione.
    expect(prisma.shopifyInventorySyncState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { lastAttemptAt: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('⭐ righe BLOCCATE davanti non impediscono di tentare quelle dietro', async () => {
    // ⛔ **Il difetto, confermato nel codice.** Il lotto prende le più vecchie
    //    per `updatedAt`, ma `base_assente` (`push:450`), `collegamento_escluso`
    //    (`push:359`) e `rinvio_attivo` (`push:1334`) **non scrivono sulla
    //    riga**: quelle righe conservano il loro `updatedAt` e restano per
    //    sempre in testa. Con cinquantacinque davanti, la cinquantaseiesima non
    //    veniva tentata mai.
    const BLOCCATE = 55;
    const DIETRO = 5;
    const esiti = [
      ...Array.from({ length: BLOCCATE }, () =>
        esitoPush({ pushed: false, reason: 'base_assente' as const }),
      ),
      ...Array.from({ length: DIETRO }, () => esitoPush()),
    ];
    const { service, inventoryPush, prisma } = setup({ rows: pending(BLOCCATE + DIETRO), esiti });

    const result = await service.retryPending(tenantId);

    // Si è arrivati oltre le bloccate, e il lavoro dietro è stato ripubblicato.
    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(BLOCCATE + DIETRO);
    expect(result.republished).toBe(DIETRO);
    expect(result.unchanged).toBe(BLOCCATE);
    expect(result.attempted).toBe(BLOCCATE + DIETRO);

    // ⭐ E ci si è arrivati SCANDENDO, non allargando il lotto: più pagine
    //    nella stessa passata, e ogni riga marcata PRIMA del tentativo.
    expect(inventoryPush.ripubblicaDisallineamento.mock.calls.length).toBeGreaterThan(50);
    expect(prisma.shopifyInventorySyncState.findMany.mock.calls.length).toBeGreaterThan(1);
    expect(prisma.shopifyInventorySyncState.updateMany).toHaveBeenCalledTimes(BLOCCATE + DIETRO);
  });

  it('⛔ il tetto dei tentativi CONCLUSIVI resta 50: le righe in più non lo sfondano', async () => {
    // Righe tutte recuperabili: ogni riga consuma un tentativo conclusivo, e al
    // cinquantesimo la passata si ferma — come prima del rimedio.
    const { service, inventoryPush } = setup({ rows: pending(120) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(50);
    expect(result).toMatchObject({ attempted: 50, republished: 50, remaining: 70 });
  });

  it('⛔ 200 NON RECUPERABILI davanti: il lavoro dietro si raggiunge in più PASSATE', async () => {
    // ⛔ **Il difetto che il tetto di scansione NON risolveva.** Con
    //    `orderBy: updatedAt` le righe che escono senza scrivere restano in
    //    testa **anche alla passata dopo**: duecento davanti e la
    //    duecentunesima non veniva raggiunta mai. Alzare il tetto lo sposta.
    //
    // ⭐ Ordinando per `lastAttemptAt`, scritto PRIMA di ogni tentativo, la
    //    coda ruota: ogni passata prosegue da dove la precedente si è fermata.
    const BLOCCATE = 220;
    const DIETRO = 3;
    const bloccata = (v: string) => v.startsWith('var-') && Number(v.slice(4)) < BLOCCATE;
    const { service, inventoryPush } = setup({
      rows: pending(BLOCCATE + DIETRO),
      esitoPerRiga: (v) =>
        bloccata(v) ? esitoPush({ pushed: false, reason: 'base_assente' as const }) : esitoPush(),
    });

    let ripubblicate = 0;
    let passate = 0;
    // Il limite PER PASSATA resta: nessuna passata esamina più di 200 righe.
    while (ripubblicate < DIETRO && passate < 10) {
      const r = await service.retryPending(tenantId);
      expect(r.attempted).toBeLessThanOrEqual(200);
      ripubblicate += r.republished;
      passate += 1;
    }

    expect(ripubblicate).toBe(DIETRO);
    // ⭐ E ci si è arrivati in più giri, non allargando il tetto.
    expect(passate).toBeGreaterThan(1);

    // Le tre righe dietro sono state davvero tentate.
    const tentate = new Set(
      inventoryPush.ripubblicaDisallineamento.mock.calls.map((c: [string, string]) => c[1]),
    );
    for (let i = BLOCCATE; i < BLOCCATE + DIETRO; i += 1) {
      expect(tentate.has(`var-${i}`)).toBe(true);
    }
  });

  it('⛔ la scansione ha un tetto: una coda tutta bloccata non gira senza fine', async () => {
    const { service, inventoryPush } = setup({
      rows: pending(1000),
      esiti: Array.from({ length: 1000 }, () =>
        esitoPush({ pushed: false, reason: 'base_assente' as const }),
      ),
    });

    const result = await service.retryPending(tenantId);

    // Nessun tentativo conclusivo: senza tetto di scansione il ciclo
    // proseguirebbe per tutte e mille.
    expect(result.republished + result.refused + result.failed).toBe(0);
    expect(result.attempted).toBe(200);
    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(200);
  });

  it('⭐ un aggiornamento locale non trasmesso passa dalla porta ORDINARIA', async () => {
    // ⛔ **Non dalla porta di recupero.** Quel valore è per definizione diverso
    //    dall'ultimo confermato, quindi la scorciatoia dell'«invariata» non lo
    //    ferma: non c'è niente da superare. Mandarlo dal recupero gli darebbe
    //    privilegi che non gli servono, su un caso che non è un disallineamento.
    const { service, inventoryPush } = setup({ rows: pendentiLocali(1) });

    const result = await service.retryPending(tenantId);

    expect(inventoryPush.pushLevel).toHaveBeenCalledTimes(1);
    expect(inventoryPush.ripubblicaDisallineamento).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 1, republished: 1 });
  });

  it('⭐ e un disallineamento osservato continua a passare dal RECUPERO', async () => {
    // La controprova: senza, la prova sopra passerebbe anche se tutto finisse
    // sulla porta ordinaria, cioè se il recupero non esistesse più.
    const { service, inventoryPush } = setup({ rows: pending(1) });

    await service.retryPending(tenantId);

    expect(inventoryPush.ripubblicaDisallineamento).toHaveBeenCalledTimes(1);
    expect(inventoryPush.pushLevel).not.toHaveBeenCalled();
  });

  it('⭐ la coda seleziona TUTTI E TRE i lavori, e li tiene distinti', async () => {
    // ⛔ Se la selezione guardasse il solo `mismatchDetected`, una coda fatta di
    //    soli aggiornamenti pendenti risulterebbe vuota e la passata uscirebbe
    //    subito: il lavoro esisterebbe e nessuno lo vedrebbe.
    //
    // ⭐ Il terzo è il tentativo APERTO (`pendingKey`): il canale è stato
    //    toccato e l'esito è ignoto. Non si rimanda — si ripete con la sua
    //    chiave — ma va ritrovato, e prima non lo ritrovava nessuno.
    const { service, prisma } = setup({ rows: [] });

    await service.retryPending(tenantId);

    const atteso = [
      { mismatchDetected: true },
      { localPushPending: true },
      { pendingKey: { not: null } },
    ];
    expect(prisma.shopifyInventorySyncState.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: atteso }) }),
    );
  });

  it('⛔ il CONTEGGIO e la SELEZIONE usano lo stesso filtro, parola per parola', async () => {
    // ⛔ **Erano due `where` gemelli scritti a mano.** Aggiungendo un criterio a
    //    uno solo, la coda conterebbe una cosa e ne esaminerebbe un'altra — e
    //    quando il conteggio dice zero la passata NON PARTE AFFATTO. È lo stesso
    //    difetto già pagato con le due letture dello stato sync.
    const { service, prisma } = setup({ rows: [] });

    await service.retryPending(tenantId);

    const primoWhere = (spia: { mock: { calls: unknown[][] } }): unknown =>
      (spia.mock.calls[0]?.[0] as { where?: unknown } | undefined)?.where;
    const dalConteggio = primoWhere(
      prisma.shopifyInventorySyncState.count as unknown as { mock: { calls: unknown[][] } },
    );
    const dallaSelezione = primoWhere(
      prisma.shopifyInventorySyncState.findMany as unknown as { mock: { calls: unknown[][] } },
    );
    // ⚠️ Con la coda vuota il lotto non viene nemmeno letto: qui interessa che,
    //    quando lo è, sia lo STESSO oggetto di filtro.
    expect(dalConteggio).toBeDefined();
    if (dallaSelezione) {
      expect(dallaSelezione).toEqual(dalConteggio);
    }
  });
});
