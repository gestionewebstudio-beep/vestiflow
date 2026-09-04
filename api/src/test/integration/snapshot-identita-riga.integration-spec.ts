import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { avviaApp, chiama, type AppIntegrazione } from './app';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * ⭐ **LA RIGA DI UN DOCUMENTO È UNA FOTOGRAFIA** — Tranche 0A.2a di
 * `docs/24`, e §«La riga di un documento è una fotografia» di
 * `regole-gestionale`.
 *
 * Il difetto che questa suite chiude: `DocumentLine` persisteva `sku`,
 * `description` e `variantLabel`, ma NON il codice articolo, il nome del
 * prodotto e il barcode. Quei tre si rileggevano dall'anagrafica corrente a
 * ogni consultazione — quindi rinominare un prodotto oggi riscriveva il nome
 * sul DDT di marzo, e cancellare una variante lasciava la riga senza identità.
 *
 * ⛔ **Perché di INTEGRAZIONE e non sul servizio.** La domanda è «cosa resta
 * scritto nel database dopo un secondo salvataggio», e le prove del servizio
 * girano su Prisma finto: vedrebbero i valori che il mapper produce, non quelli
 * che la colonna conserva. Qui il documento si crea via HTTP, l'anagrafica si
 * modifica DAVVERO fra un salvataggio e l'altro, e la verifica legge la riga
 * dal PostgreSQL di prova.
 *
 * ⚠️ **La fotografia la scatta il SERVER**, dalla variante scelta: il client non
 * manda questi tre campi e non deve poterli imporre. È la precisazione del
 * proprietario del 02/09/2026 — «così non dipende da dati incompleti o
 * manipolati inviati dall'interfaccia».
 */
const PRODOTTO = '7a100000-0000-4000-8000-00000000f001';
const VARIANTE = '7a200000-0000-4000-8000-00000000f002';
const VARIANTE_2 = '7a200000-0000-4000-8000-00000000f003';

/** I valori di ANAGRAFICA al momento del primo salvataggio. */
const ORIGINE = {
  articleCode: 'ART-ORIGINE',
  productName: 'Maglia cotone — nome di allora',
  barcode: '8001111111111',
} as const;

/** Quelli con cui l'anagrafica viene riscritta DOPO. */
const DOPO = {
  articleCode: 'ART-RINOMINATO',
  productName: 'Maglia cotone — nome di oggi',
  barcode: '8009999999999',
} as const;

interface RigaPersistita {
  readonly id: string;
  readonly articleCode: string | null;
  readonly productName: string | null;
  readonly barcode: string | null;
  readonly sku: string | null;
  readonly variantId: string | null;
}

describe('Snapshot identità di riga — su PostgreSQL TEST', () => {
  let app: AppIntegrazione;
  let prisma: PrismaClient;
  let token: string;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    await creaDataset(prisma);

    await prisma.product.create({
      data: {
        id: PRODOTTO,
        tenantId: IDS.tenantA,
        articleCode: ORIGINE.articleCode,
        name: ORIGINE.productName,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: VARIANTE,
        tenantId: IDS.tenantA,
        productId: PRODOTTO,
        sku: 'SKU-FOTO-1',
        barcode: ORIGINE.barcode,
        sellingPriceMinor: 2500,
      },
    });
    // La seconda variante serve al caso «cambio variante»: stesso prodotto,
    // barcode diverso — così si vede quale dei due la riga rifotografa.
    await prisma.productVariant.create({
      data: {
        id: VARIANTE_2,
        tenantId: IDS.tenantA,
        productId: PRODOTTO,
        sku: 'SKU-FOTO-2',
        barcode: '8002222222222',
        sellingPriceMinor: 3000,
      },
    });

    app = await avviaApp();
    token = await app.token(IDS.authA1);
  }, 120_000);

  afterAll(async () => {
    await app?.chiudi();
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  }, 60_000);

  /*
    ⛔ **Il ripristino non sta in coda al test che sporca.** Ce l'aveva, e
    quando quel test è fallito il ripristino non è stato eseguito: la prova
    successiva ha letto l'anagrafica modificata e è fallita anche lei, per una
    causa che non era la sua. Un fallimento che ne produce altri nasconde quale
    sia il difetto vero.

    ⭐ Qui l'anagrafica torna a `ORIGINE` SEMPRE, anche dopo un fallimento.
  */
  afterEach(async () => {
    await prisma.product.update({
      where: { id: PRODOTTO },
      data: { articleCode: ORIGINE.articleCode, name: ORIGINE.productName },
    });
    await prisma.productVariant.update({
      where: { id: VARIANTE },
      data: { barcode: ORIGINE.barcode },
    });
  });

  /**
   * ⚠️ Il corpo di MODIFICA non porta `type`: `UpdateDocumentDto` non lo
   * dichiara, e con `forbidNonWhitelisted` un campo di troppo è un 400 — che
   * si legge come «i dati non sono validi» senza dire quale.
   */
  function corpoModifica(righe: readonly unknown[]) {
    return { documentDate: '2026-09-03', locationId: IDS.locA1, lines: righe };
  }

  function corpoDocumento(righe: readonly unknown[]) {
    return {
      // ⚠️ `sales_ddt` e non `quote`: la fixture condivisa concede a questo
      // utente le sole famiglie `invoice` e `sales_ddt`. Il tipo qui è un
      // veicolo — la tranche riguarda il percorso generico, non un tipo.
      type: 'sales_ddt',
      documentDate: '2026-09-03',
      locationId: IDS.locA1,
      lines: righe,
    };
  }

  const rigaSuVariante = {
    variantId: VARIANTE,
    description: 'Maglia cotone',
    quantity: 2,
    // Nessun movimento: questa prova guarda l'identità, non la giacenza.
    loadsStock: false,
    unitPriceMinor: 2500,
  };

  async function righeDi(documentId: string): Promise<readonly RigaPersistita[]> {
    return prisma.documentLine.findMany({
      where: { documentId },
      orderBy: { lineNumber: 'asc' },
      select: {
        id: true,
        articleCode: true,
        productName: true,
        barcode: true,
        sku: true,
        variantId: true,
      },
    });
  }

  /**
   * Il PDF senza i suoi metadati non deterministici.
   *
   * ⚠️ pdfkit genera a ogni produzione un `/ID` casuale e una data di
   * creazione: due stampe dello STESSO documento non sono mai identiche byte
   * per byte, e un confronto diretto fallirebbe sempre — misurato il
   * 03/09/2026, con le due stampe diverse nel solo `/ID`.
   *
   * ⭐ Tolti quelli, resta il CONTENUTO, che è ciò che questa prova misura.
   */
  function senzaMetadati(corpo: unknown): string {
    return String(corpo)
      .replace(/\/ID \[<[0-9a-f]*> <[0-9a-f]*>\]/gi, '/ID []')
      .replace(/\/(?:Creation|Mod)Date \([^)]*\)/g, '/Date ()');
  }

  /** Crea un documento e ne restituisce l'id, dicendo PERCHÉ se fallisce. */
  async function creaDocumento(righe: readonly unknown[]): Promise<string> {
    const esito = await chiama(app, 'POST', '/documents', {
      token,
      corpo: corpoDocumento(righe),
    });
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('201');
    return (esito.corpo as { id: string }).id;
  }

  /*
    ⭐ **CASO 1 — la creazione fotografa.** I tre campi non arrivano dal client:
    li risolve il server dalla variante scelta.
  */
  it('⭐ creando una riga, il server fotografa codice, nome e barcode', async () => {
    const id = await creaDocumento([rigaSuVariante]);
    const [riga] = await righeDi(id);

    expect(riga).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⛔ **CASO 2 — il risalvataggio CONSERVA.** È il cuore della tranche: fra i
    due salvataggi l'anagrafica cambia per intero, e la riga deve continuare a
    dire com'era il prodotto quando il documento è stato compilato.

    ⚠️ Senza questa prova il difetto tornerebbe muto: a schermo il documento
    sembra giusto — mostra un nome di prodotto che esiste — e solo chi conosce
    il documento originale si accorge che non è più quello di allora.
  */
  it('⛔ risalvando dopo una modifica dell\'anagrafica, la riga CONSERVA i valori di allora', async () => {
    const id = await creaDocumento([rigaSuVariante]);
    const [prima] = await righeDi(id);
    expect(prima?.productName).toBe(ORIGINE.productName);

    // L'anagrafica cambia DAVVERO, non per finta.
    await prisma.product.update({
      where: { id: PRODOTTO },
      data: { articleCode: DOPO.articleCode, name: DOPO.productName },
    });
    await prisma.productVariant.update({
      where: { id: VARIANTE },
      data: { barcode: DOPO.barcode },
    });

    /*
      ⭐ **L'`id` della riga è ciò che la rende ESISTENTE.** Senza, il server
      la tratta — correttamente — come una riga nuova, e una riga nuova
      fotografa l'anagrafica di adesso. È la stessa disciplina di
      `variantLabelSnapshot`, ed è il contratto che il client rispetta:
      `CreateDocumentLineDto` porta `id?: string` proprio per questo.

      ⚠️ Questa prova l'ha misurato: senza `id` i tre campi si riscrivevano
      con `ART-RINOMINATO`, e sembrava un difetto del server.
    */
    const esito = await chiama(app, 'PATCH', `/documents/${id}`, {
      token,
      corpo: corpoModifica([{ ...rigaSuVariante, id: prima!.id, quantity: 3 }]),
    });
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('200');

    const [dopo] = await righeDi(id);
    expect(dopo).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⭐ **CASO 3 — cambiare variante RIFOTOGRAFA.** La conservazione del caso 2
    vale per la riga che non è cambiata: se l'operatore sceglie un altro
    articolo, la riga è un'altra cosa e i suoi snapshot vanno rifatti.

    ⚠️ È la stessa disciplina di `variantLabelSnapshot`, e la distinzione è
    quella che rende la regola applicabile: «conserva» non vuol dire «non
    aggiorna mai», vuol dire «non riderivare ciò che non è stato toccato».
  */
  it('⭐ cambiando la variante di una riga, gli snapshot si RIFANNO sulla nuova', async () => {
    const id = await creaDocumento([rigaSuVariante]);
    const [prima] = await righeDi(id);
    expect(prima?.barcode).toBe(ORIGINE.barcode);

    // ⚠️ Con l'`id`: è la STESSA riga che cambia articolo. Senza, sarebbe una
    // riga nuova, che si rifotografa comunque — e la prova non direbbe niente.
    const esito = await chiama(app, 'PATCH', `/documents/${id}`, {
      token,
      corpo: corpoModifica([{ ...rigaSuVariante, id: prima!.id, variantId: VARIANTE_2 }]),
    });
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('200');

    expect((await righeDi(id))[0]).toMatchObject({
      variantId: VARIANTE_2,
      barcode: '8002222222222',
      // Il prodotto è lo stesso: codice e nome non cambiano, ed è corretto.
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
    });
  });

  /*
    ⭐ **CASO 5 — la fotografia si RILEGGE.** Persisterla e non restituirla
    varrebbe zero per chi apre il documento: il caricamento deve portare i tre
    campi al client.

    ⛔ Le altre prove leggono la riga dal DATABASE, quindi da sole non dicono
    niente sulla risposta HTTP — un `select` che li omettesse le lascerebbe
    tutte verdi.
  */
  it('⭐ il caricamento del documento RESTITUISCE i tre campi fotografati', async () => {
    const id = await creaDocumento([rigaSuVariante]);

    const esito = await chiama(app, 'GET', `/documents/${id}`, { token });
    expect(esito.stato).toBe(200);

    const righe = (esito.corpo as { lines: readonly Record<string, unknown>[] }).lines;
    expect(righe[0]).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⭐ **CASO 6 — GUARDARE non basta a cambiare.** L'anagrafica cambia e il
    documento NON si risalva: la riapertura deve continuare a dire quello che
    diceva.

    ⚠️ Non è il caso 2 con altre parole. Là si misurava che il RISALVATAGGIO
    conservasse; qui non si salva niente — è il gesto ordinario, aprire un
    documento vecchio per guardarlo, ed è quello che l'operatore fa cento volte
    al giorno.
  */
  it('⛔ rinominare l\'anagrafica NON cambia ciò che la riapertura mostra', async () => {
    const id = await creaDocumento([rigaSuVariante]);

    await prisma.product.update({
      where: { id: PRODOTTO },
      data: { articleCode: DOPO.articleCode, name: DOPO.productName },
    });
    await prisma.productVariant.update({
      where: { id: VARIANTE },
      data: { barcode: DOPO.barcode },
    });

    const esito = await chiama(app, 'GET', `/documents/${id}`, { token });
    expect(esito.stato).toBe(200);

    const righe = (esito.corpo as { lines: readonly Record<string, unknown>[] }).lines;
    expect(righe[0]).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⭐ **CASO 7 — e nemmeno la STAMPA cambia.** Il PDF nasce da `getById`, che
    legge la riga: se ne uscisse un documento diverso dopo una rinomina,
    significherebbe che da qualche parte la stampa va in anagrafica.

    ⚠️ Il confronto è sui BYTE, e non è un vezzo: pdfkit comprime i flussi,
    quindi il testo dentro il buffer non è cercabile e un'asserzione sul
    contenuto non si può scrivere. Due stampe identiche sono però la stessa
    affermazione, presa dall'altro capo.
  */
  it('⛔ rinominare l\'anagrafica NON cambia la stampa del documento', async () => {
    const id = await creaDocumento([rigaSuVariante]);

    const prima = await chiama(app, 'GET', `/documents/${id}/export/pdf`, { token });
    expect(`${prima.stato}`).toBe('200');

    await prisma.product.update({
      where: { id: PRODOTTO },
      data: { articleCode: DOPO.articleCode, name: DOPO.productName },
    });
    await prisma.productVariant.update({
      where: { id: VARIANTE },
      data: { barcode: DOPO.barcode },
    });

    const dopo = await chiama(app, 'GET', `/documents/${id}/export/pdf`, { token });
    expect(dopo.stato).toBe(200);

    // Stesso documento, stessa stampa: l'anagrafica non entra nel PDF.
    expect(senzaMetadati(dopo.corpo)).toBe(senzaMetadati(prima.corpo));
  });

  /*
    ══════════════════════════════════════════════════════════════════════
    TRANCHE 0A.2c — DUPLICAZIONE E CONVERSIONE

    ⭐ Una riga che DERIVA da un'altra dichiara `sourceDocumentLineId`, e il
    server ne copia gli snapshot DAL DATABASE. Il client manda un id, non dei
    valori: è la forma che tiene insieme «duplicare conserva l'identità» e «la
    fotografia la compone il server».
    ══════════════════════════════════════════════════════════════════════
  */

  /** L'id della prima riga di un documento: è il riferimento da dichiarare. */
  async function primaRigaDi(documentId: string): Promise<string> {
    const righe = await righeDi(documentId);
    return righe[0]!.id;
  }

  /** Riscrive l'anagrafica con i valori nuovi. L'`afterEach` la riporta indietro. */
  async function rinominaAnagrafica(): Promise<void> {
    await prisma.product.update({
      where: { id: PRODOTTO },
      data: { articleCode: DOPO.articleCode, name: DOPO.productName },
    });
    await prisma.productVariant.update({
      where: { id: VARIANTE },
      data: { barcode: DOPO.barcode },
    });
  }

  /*
    ⭐ **1 — DUPLICAZIONE dopo la modifica dell'anagrafica.**
  */
  it('⭐ duplicare dopo una rinomina conserva l\'identità dell\'ORIGINALE', async () => {
    const originale = await creaDocumento([rigaSuVariante]);
    const rigaOriginale = await primaRigaDi(originale);

    await rinominaAnagrafica();

    // Il duplicato: righe SENZA id proprio, col riferimento alla sorgente.
    const duplicato = await creaDocumento([
      { ...rigaSuVariante, sourceDocumentLineId: rigaOriginale },
    ]);

    expect((await righeDi(duplicato))[0]).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⭐ **2 — CONVERSIONE dopo la modifica dell'anagrafica.**

    ⚠️ Passa dal PRECOMPILATO vero (`POST :id/convert-prefill`), non da un corpo
    scritto a mano: è quel precompilato a dover portare il riferimento, e una
    prova che lo aggiungesse da sé certificherebbe un client che non esiste.
  */
  it('⭐ convertire dopo una rinomina conserva l\'identità della SORGENTE', async () => {
    const sorgente = await creaDocumento([rigaSuVariante]);

    const prefill = await chiama(app, 'POST', `/documents/${sorgente}/convert-prefill`, {
      token,
      corpo: { targetType: 'invoice' },
    });
    expect(`${prefill.stato} ${JSON.stringify(prefill.corpo)}`).toContain('201');

    const righePrefill = (prefill.corpo as { lines: readonly Record<string, unknown>[] }).lines;
    // ⭐ Il precompilato DICE da quale riga nasce: è il perno della tranche.
    expect(righePrefill[0]?.['sourceDocumentLineId']).toBe(await primaRigaDi(sorgente));

    await rinominaAnagrafica();

    // Il client rimanda il precompilato così com'è: è ciò che fa la maschera.
    const esito = await chiama(app, 'POST', '/documents', {
      token,
      corpo: {
        type: 'invoice',
        documentDate: '2026-09-03',
        locationId: IDS.locA1,
        lines: righePrefill,
      },
    });
    expect(`${esito.stato} ${JSON.stringify(esito.corpo)}`).toContain('201');

    const convertito = (esito.corpo as { id: string }).id;
    expect((await righeDi(convertito))[0]).toMatchObject({
      articleCode: ORIGINE.articleCode,
      productName: ORIGINE.productName,
      barcode: ORIGINE.barcode,
    });
  });

  /*
    ⛔ **3 — CAMBIO VOLONTARIO della variante.** La riga non deriva più:
    l'articolo è un altro, e gli snapshot sono quelli del nuovo.

    ⚠️ Qui il riferimento viene mandato lo stesso, ed è il caso peggiore: il
    client potrebbe dimenticare di azzerarlo. Il server NON deve copiare
    l'identità di un prodotto sopra quella di un altro.
  */
  it('⛔ variante cambiata: gli snapshot sono della NUOVA, non della sorgente', async () => {
    const originale = await creaDocumento([rigaSuVariante]);
    const rigaOriginale = await primaRigaDi(originale);

    const duplicato = await creaDocumento([
      {
        ...rigaSuVariante,
        sourceDocumentLineId: rigaOriginale,
        // L'operatore ha scelto un altro articolo dopo il precompilato.
        variantId: VARIANTE_2,
      },
    ]);

    expect((await righeDi(duplicato))[0]).toMatchObject({
      variantId: VARIANTE_2,
      barcode: '8002222222222',
    });
  });

  /*
    ⛔ **4 — Uno snapshot `null` resta `null`.** È la regola che vieta il
    ripiego: una riga sorgente senza codice non lo fa comparire nel duplicato
    pescandolo dall'anagrafica di oggi.
  */
  it('⛔ sorgente con snapshot null: il duplicato resta null, non li ricostruisce', async () => {
    const originale = await creaDocumento([rigaSuVariante]);
    const rigaOriginale = await primaRigaDi(originale);

    // Una riga storica, salvata prima che le colonne esistessero.
    await prisma.documentLine.update({
      where: { id: rigaOriginale },
      data: { articleCode: null, productName: null, barcode: null },
    });

    const duplicato = await creaDocumento([
      { ...rigaSuVariante, sourceDocumentLineId: rigaOriginale },
    ]);

    const riga = (await righeDi(duplicato))[0];
    expect(riga?.articleCode).toBeNull();
    expect(riga?.productName).toBeNull();
    expect(riga?.barcode).toBeNull();
  });

  /*
    ⛔ **5 — UN RIFERIMENTO NON VALIDO RIFIUTA IL SALVATAGGIO.**

    ⚠️ Qui la prova si aspettava il RIPIEGO su «riga nuova», e la difendeva
    come «il comportamento più prudente». Non lo era: la riga veniva
    rifotografata dall'anagrafica CORRENTE e il documento si salvava lo
    stesso — plausibile, e sbagliato. Un documento che sembra giusto non lo
    va a controllare nessuno.

    ⭐ I due casi — id inesistente, id di un'altra azienda — devono fallire
    **allo stesso modo**: se il messaggio li distinguesse, questo campo
    diventerebbe un modo per scoprire se un id di riga esiste altrove.
  */
  /** Quanti documenti ha il tenant adesso: serve a dire che non se ne crea uno. */
  async function quantiDocumenti(): Promise<number> {
    return prisma.document.count({ where: { tenantId: IDS.tenantA } });
  }

  /** Il corpo di un documento che dichiara un riferimento sorgente. */
  function corpoConSorgente(sourceDocumentLineId: string) {
    return corpoDocumento([{ ...rigaSuVariante, sourceDocumentLineId }]);
  }

  it('⛔ riferimento INESISTENTE: il salvataggio è rifiutato', async () => {
    const prima = await quantiDocumenti();

    const esito = await chiama(app, 'POST', '/documents', {
      token,
      corpo: corpoConSorgente('7a900000-0000-4000-8000-00000000ffff'),
    });

    expect(esito.stato).toBe(422);
    // ⛔ E NON si crea niente: un documento a metà sarebbe peggio del rifiuto.
    expect(await quantiDocumenti()).toBe(prima);
  });

  it('⛔ riferimento di un ALTRO TENANT: rifiutato allo stesso modo', async () => {
    // Una riga che esiste davvero, ma nel tenant B. Con la STESSA variante:
    // senza, a scartarla sarebbe il controllo sulla variante e non il tenant.
    const rigaAltrui = await prisma.documentLine.create({
      data: {
        tenantId: IDS.tenantB,
        documentId: IDS.docB1,
        lineNumber: 99,
        description: 'Riga di un altro tenant',
        variantId: VARIANTE,
        variantLabel: '',
        quantity: 1,
        unitPriceMinor: 0,
        discountPercent: 0,
        lineTotalMinor: 0,
        loadsStock: false,
        articleCode: 'ART-DI-UN-ALTRO',
        productName: 'Prodotto di un altro tenant',
        barcode: '9999999999999',
      },
      select: { id: true },
    });
    const prima = await quantiDocumenti();

    const esito = await chiama(app, 'POST', '/documents', {
      token,
      corpo: corpoConSorgente(rigaAltrui.id),
    });

    expect(esito.stato).toBe(422);
    expect(await quantiDocumenti()).toBe(prima);

    // ⭐ **Il messaggio non dice che la riga esiste altrove.** Deve essere
    //    indistinguibile da quello del riferimento inesistente, o basterebbe
    //    provare id a caso per scoprire quali esistono in altre aziende.
    const inesistente = await chiama(app, 'POST', '/documents', {
      token,
      corpo: corpoConSorgente('7a900000-0000-4000-8000-00000000fffe'),
    });
    expect((esito.corpo as { message?: string }).message).toBe(
      (inesistente.corpo as { message?: string }).message,
    );
  });

  /*
    ⛔ **6 — Il documento SORGENTE non si tocca.** Duplicare è un'operazione di
    sola lettura sull'originale: se lo modificasse, il difetto sarebbe molto
    peggiore di quello che la tranche chiude.
  */
  it('⛔ duplicare NON modifica il documento sorgente', async () => {
    const originale = await creaDocumento([rigaSuVariante]);
    const rigaOriginale = await primaRigaDi(originale);
    const prima = await righeDi(originale);

    await rinominaAnagrafica();
    await creaDocumento([{ ...rigaSuVariante, sourceDocumentLineId: rigaOriginale }]);

    const dopo = await righeDi(originale);
    expect(dopo).toEqual(prima);
  });

  /*
    ⭐ **CASO 4 — riga senza articolo: `null`, non stringa vuota.** Una riga
    descrittiva (una nota, una voce a testo libero) non ha un'identità da
    fotografare.

    ⛔ La distinzione conta: `''` è un codice articolo vuoto — un valore — e
    finirebbe in una ricerca per codice o in un export come colonna presente.
    `null` dice «questa riga non ha un articolo», che è la verità.
  */
  it('⭐ una riga senza articolo lascia i tre campi a null, non a stringa vuota', async () => {
    const id = await creaDocumento([
      {
        description: 'Riga descrittiva senza articolo',
        quantity: 1,
        unitPriceMinor: 0,
        loadsStock: false,
      },
    ]);
    const [riga] = await righeDi(id);

    expect(riga).toMatchObject({
      variantId: null,
      articleCode: null,
      productName: null,
      barcode: null,
    });
  });
});
