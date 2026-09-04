import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { CashCheckoutService } from '../../cash-sessions/cash-checkout.service';
import { CashClosingService } from '../../cash-sessions/cash-closing.service';
import { CashReturnService } from '../../cash-sessions/cash-return.service';
import { CashSessionsService } from '../../cash-sessions/cash-sessions.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { withFiscalAdapters } from '../../fiscal/fiscal-adapter-registry';
import { lockDocumentCounter } from '../../documents/document-numbering.util';
import { DocumentSettingsService } from '../../documents/document-settings.service';

import { creaClientIntegrazione } from './prisma';

/**
 * Collaudo della chiusura di cassa (tranche C4B, `docs/25` §9).
 *
 * ⛔ **Ciò che questi test falsificano**, uno per uno:
 *
 * ```text
 *   gli attesi si vedono prima      NO: restano NULL finche` la sessione e` aperta
 *   i documenti annullati contano   NO: escono dalla quadratura
 *   la classe la da` il Tipo        NO: la da` la QUOTA, ed e` congelata
 *   la differenza e` una colonna    NO: e` contato - atteso, derivata
 *   l_elettronico e` obbligatorio   NO: `null` significa «non riconciliato»
 *   due chiusure ne scrivono due    NO: una sola, l_altra riceve conflitto
 *   la quadratura si ricalcola      NO: e` congelata al momento della chiusura
 * ```
 */

const PREFISSO = 'COLLAUDO C4B';

describe('chiusura di cassa — C4B su PostgreSQL TEST', () => {
  let prisma: PrismaClient;
  let checkout: CashCheckoutService;
  let resi: CashReturnService;
  let sessioni: CashSessionsService;
  let chiusura: CashClosingService;
  let impostazioni: DocumentSettingsService;

  let tenant = '';
  let sede = '';
  let variante = '';
  let contanti = '';
  let carta = '';
  let dispositivo = '';
  let ripristinaAdapter: (() => void) | null = null;

  const utente = (tenantId: string, sedi?: string[]): UserProfileDto =>
    ({
      id: '00000000-0000-4000-8000-00000000c4b0',
      tenantId,
      displayName: 'Cassiere',
      role: sedi ? 'clerk' : 'owner',
      supportSession: false,
      hasAllLocationsAccess: !sedi,
      assignedLocationIds: sedi ?? [],
      permissions: [],
    }) as unknown as UserProfileDto;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    const finto = prisma as never;
    const canali = { pushInventoryLevels: async () => undefined } as never;
    checkout = new CashCheckoutService(
      finto,
      new DocumentSettingsService(finto),
      new CreationIntentService(finto),
      canali,
    );
    resi = new CashReturnService(
      finto,
      new DocumentSettingsService(finto),
      new CreationIntentService(finto),
      canali,
    );
    sessioni = new CashSessionsService(finto);
    chiusura = new CashClosingService(finto);
    impostazioni = new DocumentSettingsService(finto);

    await pulisci(prisma);
    tenant = await creaTenant(prisma);
    sede = await creaSede(prisma, tenant, 'A');
    variante = await creaVariante(prisma, tenant);
    contanti = await creaTipo(prisma, tenant, 'Contanti', 'cash', 1);
    carta = await creaTipo(prisma, tenant, 'Carta', 'electronic', 2);
    // ⚠️ Un adapter finto: il registro nasce VUOTO (C1B), e senza una chiave
    //    riconosciuta un dispositivo non si può rendere operativo.
    ripristinaAdapter = withFiscalAdapters(['collaudo-c4b']);
    const d = await prisma.fiscalDevice.create({
      data: {
        tenantId: tenant,
        locationId: sede,
        brand: 'other',
        adapterKey: 'collaudo-c4b',
        enabled: true,
        notes: PREFISSO,
      },
    });
    dispositivo = d.id;
  }, 120_000);

  afterEach(async () => {
    await svuota(prisma);
  });

  afterAll(async () => {
    ripristinaAdapter?.();
    ripristinaAdapter = null;
    if (prisma) {
      await pulisci(prisma);
      await prisma.$disconnect();
    }
  });

  async function apri(fondo = 0): Promise<string> {
    const s = await sessioni.open(tenant, utente(tenant), {
      locationId: sede,
      openingFloatMinor: fondo,
    });
    return s.id;
  }

  /** Una vendita di `quantita` pezzi a 100,00 €, contanti o carta. */
  async function vendi(
    sessionId: string,
    quantita: number,
    modo: 'contanti' | 'carta',
    intento: string,
  ): Promise<{ documentId: string; lineId: string; quotaId: string; totale: number }> {
    const totale = quantita * 10_000;
    const esito = await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId,
      creationIntentId: `${PREFISSO}-${intento}`,
      lines: [{ variantId: variante, quantity: quantita, unitPriceMinor: 10_000 }],
      payments:
        modo === 'contanti'
          ? [{ paymentOptionId: contanti, amountMinor: totale, tenderedMinor: totale }]
          : [{ paymentOptionId: carta, amountMinor: totale, confirmed: true }],
    });
    const riga = await prisma.documentLine.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    const quota = await prisma.storeSalePayment.findFirstOrThrow({
      where: { documentId: esito.documentId },
    });
    return { documentId: esito.documentId, lineId: riga.id, quotaId: quota.id, totale };
  }

  // ── La cecità ─────────────────────────────────────────────────────────────

  /**
   * ⭐ **La chiusura è cieca per COSTRUZIONE**, non per scelta della maschera:
   * gli attesi non esistono finché la sessione è aperta, e nessuna rotta li
   * calcola. Un conteggio fatto sapendo il risultato non è un conteggio.
   */
  it('a sessione APERTA gli attesi non esistono', async () => {
    const s = await apri(5_000);
    await vendi(s, 1, 'contanti', 'cieca');

    const aperta = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(aperta.expectedCashMinor).toBeNull();
    expect(aperta.expectedElectronicMinor).toBeNull();
    expect(aperta.countedCashMinor).toBeNull();

    // ⭐ E nemmeno la lettura della sessione corrente li espone.
    const corrente = await sessioni.current(tenant, utente(tenant), sede);
    expect(corrente.session?.expectedCashMinor).toBeNull();
    expect(Object.keys(corrente)).toEqual(['session', 'depositsMinor', 'withdrawalsMinor']);
  });

  // ── La quadratura ─────────────────────────────────────────────────────────

  it('la quadratura: fondo, vendite, resi, versamenti e prelievi', async () => {
    const s = await apri(5_000);
    const v = await vendi(s, 3, 'contanti', 'quad-v'); // +300,00 contanti
    await vendi(s, 1, 'carta', 'quad-c'); // +100,00 elettronico
    await sessioni.addMovement(tenant, utente(tenant), sede, s, {
      type: 'deposit',
      amountMinor: 2_000,
      reason: 'fondo aggiuntivo',
    });
    await sessioni.addMovement(tenant, utente(tenant), sede, s, {
      type: 'withdrawal',
      amountMinor: 1_000,
      reason: 'spesa',
    });
    // Un reso in contanti: −100,00.
    await resi.createReturn(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      originalDocumentId: v.documentId,
      creationIntentId: `${PREFISSO}-quad-r`,
      reason: 'taglia sbagliata',
      lines: [{ originalLineId: v.lineId, quantity: 1 }],
      refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
    });

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 25_500,
      declaredElectronicMinor: 10_000,
    });

    // 5.000 + 30.000 − 10.000 + 2.000 − 1.000 = 26.000
    expect(esito.expectedCashMinor).toBe(26_000);
    // ⭐ Né fondo né cassetto entrano nell'elettronico.
    expect(esito.expectedElectronicMinor).toBe(10_000);
    expect(esito.cashDifferenceMinor).toBe(-500);
    expect(esito.electronicDifferenceMinor).toBe(0);

    const salvata = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(salvata.status).toBe('closed');
    expect(salvata.expectedCashMinor).toBe(26_000);
    expect(salvata.expectedElectronicMinor).toBe(10_000);
    expect(salvata.countedCashMinor).toBe(25_500);
    expect(salvata.closedAt).not.toBeNull();
  });

  it('una sessione SENZA vendite quadra su fondo e cassetto', async () => {
    const s = await apri(5_000);
    await sessioni.addMovement(tenant, utente(tenant), sede, s, {
      type: 'withdrawal',
      amountMinor: 1_500,
      reason: 'prelievo',
    });

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 3_500,
    });

    expect(esito.expectedCashMinor).toBe(3_500);
    expect(esito.expectedElectronicMinor).toBe(0);
    expect(esito.cashDifferenceMinor).toBe(0);
  });

  /**
   * ⛔ È l'errore che il ramo storico faceva: la sua query non filtrava su
   * `status`, e un `store_sale` annullato entrava negli attesi.
   */
  it('i documenti ANNULLATI non contribuiscono alla quadratura', async () => {
    const s = await apri(0);
    const buona = await vendi(s, 1, 'contanti', 'ann-buona');
    const annullata = await vendi(s, 2, 'contanti', 'ann-annullata');
    await prisma.document.update({
      where: { id: annullata.documentId },
      data: { status: 'cancelled' },
    });

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 10_000,
    });

    // ⭐ Solo la vendita buona: 100,00 €, non 300,00.
    expect(esito.expectedCashMinor).toBe(10_000);
    expect(esito.salesCashMinor).toBe(buona.totale);
  });

  /**
   * ⭐ La classe la porta la QUOTA, non il Tipo corrente: riclassificare un
   * Tipo domani non deve cambiare la quadratura di ieri.
   */
  it('riclassificare il Tipo NON sposta la quadratura', async () => {
    const s = await apri(0);
    // ⚠️ Un Tipo USA-E-GETTA: riclassificare quello condiviso legherebbe le
    //    prove successive alla riuscita di questa — se fallisce prima di
    //    rimetterlo a posto, cadono anche le altre.
    const usaEGetta = await creaTipo(prisma, tenant, 'Contanti bis', 'cash', 9);
    await checkout.checkout(tenant, utente(tenant), {
      locationId: sede,
      sessionId: s,
      creationIntentId: `${PREFISSO}-riclass`,
      lines: [{ variantId: variante, quantity: 1, unitPriceMinor: 10_000 }],
      payments: [{ paymentOptionId: usaEGetta, amountMinor: 10_000, tenderedMinor: 10_000 }],
    });

    // Il titolare riclassifica il Tipo DOPO la vendita.
    await prisma.paymentOption.update({
      where: { id: usaEGetta },
      data: { tenderKind: 'electronic' },
    });

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 10_000,
    });

    // ⭐ Resta CONTANTE: lo dice lo snapshot della quota.
    expect(esito.expectedCashMinor).toBe(10_000);
    expect(esito.expectedElectronicMinor).toBe(0);
  });

  /**
   * ⛔ Gli attesi sono CONGELATI: dopo la chiusura la quadratura è un fatto
   * storico, e annullare un documento non la riscrive.
   */
  it('la quadratura è CONGELATA: annullare un documento dopo non la cambia', async () => {
    const s = await apri(0);
    const v = await vendi(s, 2, 'contanti', 'congelata');

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 20_000,
    });
    expect(esito.expectedCashMinor).toBe(20_000);

    await prisma.document.update({ where: { id: v.documentId }, data: { status: 'cancelled' } });

    const dopo = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(dopo.expectedCashMinor).toBe(20_000);
  });

  /**
   * ⛔ La differenza NON è una colonna: è `contato − atteso`, e persisterla
   * creerebbe un terzo valore capace di contraddire i due da cui deriva.
   */
  it('la differenza è DERIVATA, non persistita', async () => {
    const s = await apri(10_000);
    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 9_700,
    });

    expect(esito.cashDifferenceMinor).toBe(-300);

    const colonne = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT "column_name" FROM "information_schema"."columns"
        WHERE "table_name" = 'cash_sessions' AND "column_name" LIKE '%difference%'`,
    );
    expect(colonne).toEqual([]);
  });

  // ── L'elettronico ─────────────────────────────────────────────────────────

  /**
   * ⛔ `declaredElectronicMinor` non è una risposta tecnica del POS: VestiFlow
   * non parla col terminale. `null` significa «non riconciliato».
   */
  it('l_elettronico dichiarato è FACOLTATIVO', async () => {
    const s = await apri(0);
    await vendi(s, 1, 'carta', 'nonriconc');

    const esito = await chiusura.close(tenant, utente(tenant), sede, s, {
      countedCashMinor: 0,
    });

    expect(esito.expectedElectronicMinor).toBe(10_000);
    expect(esito.declaredElectronicMinor).toBeNull();
    // ⭐ Non riconciliato: la differenza elettronica non esiste, non è zero.
    expect(esito.electronicDifferenceMinor).toBeNull();
  });

  it('gli importi NEGATIVI sono rifiutati', async () => {
    const s = await apri(0);

    await expect(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: -1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      chiusura.close(tenant, utente(tenant), sede, s, {
        countedCashMinor: 0,
        declaredElectronicMinor: -1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // ── Le quote che la chiusura non sa trattare ──────────────────────────────

  /**
   * ⛔ **Nessun ramo di ripiego**: il `bucket()` del ramo storico mandava «ogni
   * metodo sconosciuto» in `other`, e una classe nuova sarebbe sparita in
   * silenzio dalla quadratura. Qui si ferma e lo dice.
   */
  it('una quota NON classificata ferma la quadratura invece di sparire', async () => {
    const s = await apri(0);
    const v = await vendi(s, 1, 'contanti', 'nonclass');
    // Una quota storica, senza classe: la simuliamo azzerando lo snapshot.
    await prisma.storeSalePayment.update({
      where: { id: v.quotaId },
      data: { tenderKindSnapshot: null },
    });

    await expect(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 10_000 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // ⭐ E la sessione resta APERTA: non si chiude una cassa che non quadra.
    const ancora = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(ancora.status).toBe('open');
  });

  it('una quota VOUCHER ferma la quadratura: i buoni non ci sono ancora', async () => {
    const s = await apri(0);
    const v = await vendi(s, 1, 'contanti', 'voucher');
    await prisma.storeSalePayment.update({
      where: { id: v.quotaId },
      data: { tenderKindSnapshot: 'voucher' },
    });

    await expect(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 10_000 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // ── La concorrenza e lo stato ─────────────────────────────────────────────

  /**
   * ⭐ Due chiusure simultanee passano ENTRAMBE dal validatore: fra la lettura
   * e la scrittura c'è tutto il calcolo. A decidere è l'aggiornamento
   * condizionale.
   */
  it('due chiusure SIMULTANEE: una sola scrive, l_altra riceve conflitto', async () => {
    const s = await apri(5_000);

    const esiti = await Promise.allSettled([
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 5_000 }),
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 9_999 }),
    ]);

    expect(esiti.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    const fallita = esiti.find((e) => e.status === 'rejected') as PromiseRejectedResult;
    // ⚠️ Il rifiuto arriva dal validatore o dall'aggiornamento condizionale, a
    //    seconda di quanto le due transazioni si serializzano: sono due
    //    messaggi diversi per lo stesso fatto, e pretenderne UNO renderebbe la
    //    prova instabile senza renderla più forte.
    expect(
      fallita.reason instanceof ConflictException ||
        fallita.reason instanceof UnprocessableEntityException,
    ).toBe(true);

    const salvata = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(salvata.status).toBe('closed');
    // ⭐ E il conteggio salvato è quello della chiusura riuscita, non l'ultimo
    //    arrivato.
    const riuscita = esiti.find((e) => e.status === 'fulfilled') as PromiseFulfilledResult<{
      countedCashMinor: number;
    }>;
    expect(salvata.countedCashMinor).toBe(riuscita.value.countedCashMinor);
  });

  it('una sessione GIÀ CHIUSA non si richiude', async () => {
    const s = await apri(0);
    await chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 0 });

    await expect(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 1_000 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /** ⭐ Dopo la chiusura quella sessione non incassa più. */
  it('su una sessione chiusa non si vende', async () => {
    const s = await apri(0);
    await chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 0 });

    await expect(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-dopochiusa`,
        lines: [{ variantId: variante, quantity: 1, unitPriceMinor: 10_000 }],
        payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('chiusa una sessione se ne apre un_altra sulla stessa sede', async () => {
    const primo = await apri(1_000);
    await chiusura.close(tenant, utente(tenant), sede, primo, { countedCashMinor: 1_000 });

    const secondo = await apri(2_000);
    expect(secondo).not.toBe(primo);
  });

  // ── Il perimetro ──────────────────────────────────────────────────────────

  it('una sede NON assegnata non chiude la sessione', async () => {
    const s = await apri(0);
    const altra = await creaSede(prisma, tenant, 'B');

    await expect(
      chiusura.close(tenant, utente(tenant, [altra]), sede, s, { countedCashMinor: 0 }),
    ).rejects.toThrow();
  });

  it('una sessione di un ALTRO tenant non si chiude', async () => {
    const altro = await creaTenant(prisma, 2);
    const suaSede = await creaSede(prisma, altro, 'X');
    const suaSessione = await sessioni.open(altro, utente(altro), {
      locationId: suaSede,
      openingFloatMinor: 0,
    });

    await expect(
      chiusura.close(tenant, utente(tenant), sede, suaSessione.id, { countedCashMinor: 0 }),
    ).rejects.toThrow();
  });

  // ── La SERIALIZZAZIONE con le altre operazioni ────────────────────────────

  /**
   * ⭐ **Il punto comune è il validatore**, non i singoli servizi: se ogni
   * operazione prendesse un lock suo, basterebbe dimenticarne uno perché la
   * quadratura tornasse a poter perdere pezzi.
   *
   * Qui la riga `cash_sessions` viene bloccata DA FUORI, e si verifica che
   * ogni operazione della sessione **attenda**.
   *
   * ⛔ **Da sola questa prova NON dimostra la mutua esclusione**, e va detto
   * perché sembra dimostrarla: misurata il 04/09/2026 **prima** del lock nel
   * validatore, passava già per cinque operazioni su sei. Il motivo è che
   * PostgreSQL prende da solo un `FOR KEY SHARE` sulla riga padre quando si
   * inserisce un figlio — un documento, un movimento — e quello confligge
   * con un `FOR UPDATE` esterno. Ma due `FOR KEY SHARE` sono **compatibili
   * fra loro**: la chiusura poteva leggere e congelare mentre una vendita
   * era in volo.
   *
   * ⭐ A dimostrare la serializzazione sono le tre prove qui sotto, che
   * mettono davvero in corsa la chiusura con un’altra operazione. Questa
   * resta perché coglie una regressione diversa: un’operazione che smettesse
   * di passare dal validatore.
   */
  describe.each([
    ['checkout', 'vendita'],
    ['reso', 'reso'],
    ['versamento', 'movimento di cassetto'],
    ['prelievo', 'movimento di cassetto'],
    ['cambio dispositivo', 'dispositivo'],
    ['chiusura', 'chiusura'],
  ])('ogni operazione passa dal lock di sessione — %s', (operazione) => {
    it('attende finché la riga della sessione è bloccata', async () => {
      const s = await apri(0);
      const preparata = await preparaOperazione(operazione, s);

      const { bloccata, esito } = await conRigaBloccata(s, preparata);

      // ⭐ Non era ancora conclusa mentre il lock era tenuto da altri.
      expect(bloccata).toBe(true);
      // …e appena liberata, conclude.
      expect(esito.status).toBe('fulfilled');
    });
  });

  /**
   * ⛔ **Il caso che la sola concorrenza fra due `close` non prende.**
   *
   * Una vendita è IN VOLO: ha superato il validatore ed è ferma sul
   * numeratore. Senza un lock sulla sessione la chiusura passa oltre, calcola
   * gli attesi senza vederla, congela e chiude — e un attimo dopo la vendita
   * si conferma su una sessione chiusa, **fuori dalla quadratura**.
   *
   * ⭐ Con il lock nel validatore la chiusura ASPETTA, e la vendita entra.
   */
  it('una vendita IN VOLO non resta fuori dagli attesi congelati', async () => {
    const s = await apri(0);
    const serie = (await impostazioni.getResolved(tenant, DocumentType.store_sale)).defaultSeries;

    // Il numeratore viene bloccato da fuori: la vendita si fermerà lì, DOPO
    // essere passata dal validatore.
    const cancello = apriCancello();
    const tenuta = prisma.$transaction(
      async (tx) => {
        await lockDocumentCounter(tx as never, {
          tenantId: tenant,
          type: DocumentType.store_sale,
          series: serie,
        });
        await cancello.attesa;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await attendi(150);

    const vendita = sorvegliata(
      checkout.checkout(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        creationIntentId: `${PREFISSO}-involo`,
        lines: [{ variantId: variante, quantity: 1, unitPriceMinor: 10_000 }],
        payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
      }),
    );
    await attendi(250);
    expect(vendita.conclusa()).toBe(false); // ferma sul numeratore

    const chiude = sorvegliata(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 10_000 }),
    );
    await attendi(250);
    // ⭐ La chiusura NON è passata oltre: sta aspettando la vendita in volo.
    expect(chiude.conclusa()).toBe(false);

    cancello.apri();
    await tenuta;

    const venduta = await vendita.promessa;
    const chiusa = await chiude.promessa;

    const documento = await prisma.document.findUniqueOrThrow({
      where: { id: venduta.documentId },
    });
    expect(documento.status).toBe('confirmed');
    // ⛔ L’invariante: confermata E dentro gli attesi congelati.
    expect(chiusa.expectedCashMinor).toBe(10_000);
    const salvata = await prisma.cashSession.findUniqueOrThrow({ where: { id: s } });
    expect(salvata.expectedCashMinor).toBe(10_000);
  });

  /**
   * ⭐ Il terzo nome dell’invariante: **un reso**. Stessa costruzione della
   * vendita in volo — il reso si ferma sul proprio numeratore — e stesso
   * esito: la chiusura aspetta, e il rimborso entra negli attesi con il
   * segno giusto.
   */
  it('un RESO in volo non resta fuori dagli attesi congelati', async () => {
    const s = await apri(0);
    const v = await vendi(s, 2, 'contanti', 'reso-involo-v'); // +200,00
    const serie = (await impostazioni.getResolved(tenant, DocumentType.store_return))
      .defaultSeries;

    const cancello = apriCancello();
    const tenuta = prisma.$transaction(
      async (tx) => {
        await lockDocumentCounter(tx as never, {
          tenantId: tenant,
          type: DocumentType.store_return,
          series: serie,
        });
        await cancello.attesa;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await attendi(150);

    const reso = sorvegliata(
      resi.createReturn(tenant, utente(tenant), {
        locationId: sede,
        sessionId: s,
        originalDocumentId: v.documentId,
        creationIntentId: `${PREFISSO}-reso-involo`,
        reason: 'reso in volo',
        lines: [{ originalLineId: v.lineId, quantity: 1 }],
        refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
      }),
    );
    await attendi(250);
    expect(reso.conclusa()).toBe(false); // fermo sul numeratore

    const chiude = sorvegliata(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 10_000 }),
    );
    await attendi(250);
    expect(chiude.conclusa()).toBe(false);

    cancello.apri();
    await tenuta;

    await reso.promessa;
    const chiusa = await chiude.promessa;

    // ⭐ 200,00 venduti − 100,00 resi.
    expect(chiusa.salesCashMinor).toBe(20_000);
    expect(chiusa.returnsCashMinor).toBe(10_000);
    expect(chiusa.expectedCashMinor).toBe(10_000);
    expect(chiusa.cashDifferenceMinor).toBe(0);
  });

  /**
   * ⭐ L’altro verso: **la chiusura arriva prima**. L’operazione attende, poi
   * trova la sessione chiusa e viene RIFIUTATA — non si infila dopo il
   * congelamento.
   */
  it('chiusura prima: il movimento attende e poi viene rifiutato', async () => {
    const s = await apri(5_000);

    const cancello = apriCancello();
    const tenuta = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "cash_sessions" WHERE "id" = $1::uuid FOR UPDATE`,
          s,
        );
        await cancello.attesa;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await attendi(150);

    // La chiusura si mette in coda per prima…
    const chiude = sorvegliata(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 5_000 }),
    );
    await attendi(200);
    // …e il versamento dopo di lei.
    const versa = sorvegliata(
      sessioni.addMovement(tenant, utente(tenant), sede, s, {
        type: 'deposit',
        amountMinor: 3_000,
        reason: 'versamento in coda',
      }),
    );
    await attendi(200);
    expect(chiude.conclusa()).toBe(false);
    expect(versa.conclusa()).toBe(false);

    cancello.apri();
    await tenuta;

    const chiusa = await chiude.promessa;
    // ⛔ Il versamento non entra: la sessione è chiusa.
    await expect(versa.promessa).rejects.toThrow();

    expect(chiusa.expectedCashMinor).toBe(5_000);
    const movimenti = await prisma.cashSessionMovement.count({ where: { sessionId: s } });
    expect(movimenti).toBe(0);
  });

  /**
   * ⭐ E il verso opposto sullo stesso movimento: se arriva prima lui, la
   * chiusura lo aspetta e lo CONTA.
   */
  it('movimento prima: la chiusura lo aspetta e lo conta', async () => {
    const s = await apri(5_000);

    const cancello = apriCancello();
    const tenuta = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "cash_sessions" WHERE "id" = $1::uuid FOR UPDATE`,
          s,
        );
        await cancello.attesa;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await attendi(150);

    const versa = sorvegliata(
      sessioni.addMovement(tenant, utente(tenant), sede, s, {
        type: 'deposit',
        amountMinor: 3_000,
        reason: 'versamento in testa',
      }),
    );
    await attendi(200);
    const chiude = sorvegliata(
      chiusura.close(tenant, utente(tenant), sede, s, { countedCashMinor: 8_000 }),
    );
    await attendi(200);
    expect(versa.conclusa()).toBe(false);
    expect(chiude.conclusa()).toBe(false);

    cancello.apri();
    await tenuta;

    await versa.promessa;
    const chiusa = await chiude.promessa;

    // ⭐ 5.000 di fondo + 3.000 versati.
    expect(chiusa.expectedCashMinor).toBe(8_000);
    expect(chiusa.depositsMinor).toBe(3_000);
    expect(chiusa.cashDifferenceMinor).toBe(0);
  });

  /** Prepara l_operazione da provare contro il lock, senza eseguirla. */
  async function preparaOperazione(operazione: string, sessionId: string): Promise<() => Promise<unknown>> {
    if (operazione === 'checkout') {
      return () =>
        checkout.checkout(tenant, utente(tenant), {
          locationId: sede,
          sessionId,
          creationIntentId: `${PREFISSO}-lock-checkout-${sessionId}`,
          lines: [{ variantId: variante, quantity: 1, unitPriceMinor: 10_000 }],
          payments: [{ paymentOptionId: contanti, amountMinor: 10_000, tenderedMinor: 10_000 }],
        });
    }
    if (operazione === 'reso') {
      // Il reso ha bisogno di una vendita da rendere: la si fa PRIMA, cosi` il
      // lock non la riguarda.
      const v = await vendi(sessionId, 1, 'contanti', `lock-reso-v-${sessionId}`);
      return () =>
        resi.createReturn(tenant, utente(tenant), {
          locationId: sede,
          sessionId,
          originalDocumentId: v.documentId,
          creationIntentId: `${PREFISSO}-lock-reso-${sessionId}`,
          reason: 'prova di lock',
          lines: [{ originalLineId: v.lineId, quantity: 1 }],
          refunds: [{ originalPaymentId: v.quotaId, amountMinor: 10_000 }],
        });
    }
    if (operazione === 'versamento' || operazione === 'prelievo') {
      const tipo = operazione === 'versamento' ? ('deposit' as const) : ('withdrawal' as const);
      return () =>
        sessioni.addMovement(tenant, utente(tenant), sede, sessionId, {
          type: tipo,
          amountMinor: 1_000,
          reason: `prova di lock ${operazione}`,
        });
    }
    if (operazione === 'cambio dispositivo') {
      return () =>
        sessioni.changeDevice(tenant, utente(tenant), sede, sessionId, {
          // ⚠️ Un dispositivo VERO: con `null` su una sessione che non ne ha,
          //    il servizio rifiuta PRIMA di toccare la riga, e la prova
          //    misurerebbe quel rifiuto invece del lock.
          fiscalDeviceId: dispositivo,
          reason: 'prova di lock',
        });
    }
    return () => chiusura.close(tenant, utente(tenant), sede, sessionId, { countedCashMinor: 0 });
  }

  /**
   * Tiene bloccata la riga della sessione, lancia l_operazione e guarda se
   * ATTENDE. Poi libera e restituisce l_esito.
   */
  async function conRigaBloccata(
    sessionId: string,
    azione: () => Promise<unknown>,
  ): Promise<{ bloccata: boolean; esito: PromiseSettledResult<unknown> }> {
    const cancello = apriCancello();
    const tenuta = prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT "id" FROM "cash_sessions" WHERE "id" = $1::uuid FOR UPDATE`,
          sessionId,
        );
        await cancello.attesa;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    await attendi(150);

    const inCorso = sorvegliata(azione());
    await attendi(300);
    const bloccata = !inCorso.conclusa();

    cancello.apri();
    await tenuta;
    const [esito] = await Promise.allSettled([inCorso.promessa]);
    return { bloccata, esito: esito! };
  }
});

// ── Aiutanti ───────────────────────────────────────────────────────────────

/** Un cancello che si apre a comando. */
function apriCancello(): { attesa: Promise<void>; apri: () => void } {
  let apri!: () => void;
  const attesa = new Promise<void>((res) => {
    apri = res;
  });
  return { attesa, apri };
}

function attendi(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Osserva una promessa senza lasciarla senza gestore.
 *
 * ⚠️ Il gestore si attacca SUBITO: una promessa rifiutata mentre nessuno l'
 * ascolta produce un `Unhandled Rejection` intermittente (`docs/25` §13-bis).
 */
function sorvegliata<T>(promessa: Promise<T>): { promessa: Promise<T>; conclusa: () => boolean } {
  let fatta = false;
  promessa.then(
    () => (fatta = true),
    () => (fatta = true),
  );
  return { promessa, conclusa: () => fatta };
}

async function creaTenant(prisma: PrismaClient, n = 1): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "tenants" ("id","name","updated_at")
     VALUES (gen_random_uuid(), $1, CURRENT_TIMESTAMP) RETURNING "id"`,
    `${PREFISSO} ${n}`,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

async function creaSede(prisma: PrismaClient, tenantId: string, nome: string): Promise<string> {
  const [r] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "locations" ("id","tenant_id","name","updated_at")
     VALUES (gen_random_uuid(), $1::uuid, $2, CURRENT_TIMESTAMP) RETURNING "id"`,
    tenantId,
    `${PREFISSO} ${nome}`,
  );
  if (!r) throw new Error('INSERT senza RETURNING');
  return r.id;
}

async function creaVariante(prisma: PrismaClient, tenantId: string): Promise<string> {
  const prodotto = await prisma.product.create({
    data: {
      tenantId,
      name: `${PREFISSO} articolo`,
      status: 'active',
      articleCode: `${PREFISSO}-ART`,
    },
  });
  const variante = await prisma.productVariant.create({
    data: {
      tenantId,
      productId: prodotto.id,
      sku: `${PREFISSO}-SKU`,
      sellingPriceMinor: 10_000,
      purchasePriceMinor: 4_000,
    },
  });
  return variante.id;
}

async function creaTipo(
  prisma: PrismaClient,
  tenantId: string,
  nome: string,
  tenderKind: 'cash' | 'electronic',
  sortOrder: number,
): Promise<string> {
  const o = await prisma.paymentOption.create({
    data: { tenantId, kind: 'method', name: `${PREFISSO} ${nome}`, sortOrder, tenderKind },
  });
  return o.id;
}

async function svuota(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await prisma.$executeRawUnsafe(`DELETE FROM "stock_movements" WHERE ${dentro}`, like);
  // ⚠️ Prima le quote di RIMBORSO: la self-FK e` RESTRICT.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "store_sale_payments" WHERE ${dentro} AND "refunded_from_payment_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "store_sale_payments" WHERE ${dentro}`, like);
  // ⚠️ Prima le righe di RESO: la self-FK e` RESTRICT.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "document_lines" WHERE ${dentro} AND "returned_from_line_id" IS NOT NULL`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "document_lines" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "documents" WHERE ${dentro} AND "type" = 'store_return'`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "documents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_session_movements" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "cash_session_device_changes" WHERE ${dentro}`,
    like,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "cash_sessions" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "creation_intents" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "inventory_levels" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "document_sequences" WHERE ${dentro}`, like);
}

async function pulisci(prisma: PrismaClient): Promise<void> {
  const like = `${PREFISSO}%`;
  const dentro = `"tenant_id" IN (SELECT "id" FROM "tenants" WHERE "name" LIKE $1)`;
  await svuota(prisma);
  await prisma.$executeRawUnsafe(`DELETE FROM "fiscal_devices" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "payment_options" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "product_variants" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "products" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "locations" WHERE ${dentro}`, like);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "name" LIKE $1`, like);
}
