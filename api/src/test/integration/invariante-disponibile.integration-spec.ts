import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { applyInventoryDelta } from '../../inventory/inventory-level-delta.util';
import { applyIncomingDelta } from '../../inventory/inventory-incoming.util';
import { applyCommittedDelta } from '../../order-reservations/committed-delta.util';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import { TENANT_BACKUP_DATA_DIR } from '../../tenant/tenant-backup/tenant-backup.constants';
import { readStreamToBuffer, rewriteTenantBackupZip } from '../fixtures/tenant-backup.fixture';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * **`available` è il valore canonico del gestionale?**
 *
 * ⭐ La domanda non è teorica: schermata, invio a Shopify e riconciliazione
 *    oggi non leggono lo stesso numero. La **schermata** legge la colonna
 *    `available`; il **push** e la **riconciliazione** ricalcolano
 *    `onHand - committed` per conto loro. Finché i due coincidono nessuno se ne
 *    accorge; il giorno che divergono, l'operatore vede un numero e il canale
 *    ne riceve un altro.
 *
 * ⛔ **Prima di far leggere `available` a chi oggi ricalcola, si verifica che
 *    la colonna sia MANTENUTA.** Queste prove misurano l'invariante
 *
 * ```text
 *     available = onHand - committed
 * ```
 *
 *    sul database vero, dopo le operazioni vere, compresi rollback e
 *    concorrenza. ⚠️ Non «per il caso che ho in mano»: il controllo conta le
 *    righe INCOERENTI di tutto il tenant, così una riga sfuggita altrove
 *    farebbe fallire lo stesso.
 *
 * ⛔ **Nessun ricalcolo, nessun aggiustamento.** Se una prova trova
 *    un'incoerenza, la incoerenza si riporta: non si «sistema» il dato.
 */
describe('L invariante del Disponibile — available = onHand - committed', () => {
  let prisma: PrismaClient;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;
  let varianteA: string;
  let varianteB: string;

  const PRODOTTO = '9d000000-0000-4000-8000-00000000d001';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const storage = new SupabaseService(config);
    exporter = new TenantBackupExportService(prisma as never, storage, config);
    importer = new TenantBackupImportService(
      prisma as never,
      storage,
      config,
      new PlatformAdminService(config),
      new AuthProfileCacheService(),
    );
  });

  /**
   * ⚠️ **Le righe di stato sync si tolgono per NOME, prima dello svuota.**
   *    `pushLevel` e la riconciliazione ne creano (`recordSuccessfulPush`), e
   *    sono l'unica traccia che questo file lascia fuori dalle tabelle del
   *    dataset comune. Misurato il 09/09/2026: senza questa cancellazione, la
   *    prova `1b` di `ripristino-storico-shopify` cade a intermittenza nella
   *    suite piena, perché l'archivio esportato può contenere uno stato sync la
   *    cui variante non c'è.
   *
   * ⛔ **È un CONTENIMENTO, non la dimostrazione della causa.** Perché quelle
   *    righe sopravvivano al `TRUNCATE … CASCADE` che ogni file esegue non è
   *    stato accertato, e questa riga non lo accerta: toglie l'impronta di
   *    questo file. Il punto resta aperto in `docs/DA-FARE`.
   *
   * ⛔ **E la pulizia NON ingoia i propri errori.** Ogni passo si tenta comunque
   *    — la connessione va rilasciata anche se la cancellazione fallisce — ma i
   *    fallimenti si conservano e si sollevano alla fine: una pulizia che
   *    fallisce in silenzio lascia il database sporco per i file successivi e
   *    fa cadere qualcun altro, lontano dalla causa.
   */
  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const guasti: string[] = [];
    const tenta = async (passo: string, azione: () => Promise<unknown>) => {
      try {
        await azione();
      } catch (errore) {
        guasti.push(`${passo}: ${errore instanceof Error ? errore.message : String(errore)}`);
      }
    };

    await tenta('cancellazione degli stati sync', () =>
      prisma.shopifyInventorySyncState.deleteMany({}),
    );
    await tenta('svuota', () => svuota(prisma));
    // ⚠️ Il rilascio della connessione avviene SEMPRE, anche dopo un fallimento:
    //    è la risorsa, e trattenerla peggiorerebbe il giro successivo.
    await tenta('disconnessione', () => prisma.$disconnect());

    if (guasti.length > 0) {
      throw new Error(`Pulizia di invariante-disponibile fallita — ${guasti.join(' | ')}`);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    const creato = await prisma.product.create({
      data: {
        id: PRODOTTO,
        tenantId: IDS.tenantA,
        name: 'Articolo per l invariante',
        articleCode: 'INV-1',
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'INV-M',
              optionValues: { T: 'M' },
              sellingPriceMinor: 1000,
            },
            {
              tenantId: IDS.tenantA,
              sku: 'INV-L',
              optionValues: { T: 'L' },
              sellingPriceMinor: 1000,
            },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    varianteA = creato.variants[0]!.id;
    varianteB = creato.variants[1]!.id;
  });

  // ── l'attrezzo: si contano le righe INCOERENTI, non si guarda una riga ────

  /**
   * Le righe del tenant che violano l'invariante, con i loro numeri.
   *
   * ⭐ **Si interroga il DATABASE, non i valori che il test crede di aver
   *    scritto**: è l'unica formulazione che prende anche una riga toccata da
   *    un percorso che questa prova non conosce.
   */
  async function incoerenti(): Promise<
    { variant_id: string; on_hand: number; committed: number; available: number }[]
  > {
    return prisma.$queryRawUnsafe(
      `SELECT variant_id, on_hand, committed, available
         FROM inventory_levels
        WHERE tenant_id = $1::uuid AND available <> on_hand - committed
        ORDER BY variant_id`,
      IDS.tenantA,
    );
  }

  async function riga(variantId: string) {
    return prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId, locationId: IDS.locA1 } },
      select: { onHand: true, committed: true, available: true, incoming: true },
    });
  }

  // ── 1 · le operazioni ordinarie ──────────────────────────────────────────

  it('I1 · carico, scarico e scarico OLTRE la giacenza: l invariante regge, il negativo resta', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 10, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 10, committed: 0, available: 10 });

    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, -3, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 7, committed: 0, available: 7 });

    // ⭐ La quantità insufficiente NON blocca: giacenza e disponibile vanno
    //    sotto zero insieme, ed è la politica dichiarata del gestionale.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, -10, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: -3, committed: 0, available: -3 });
    expect(await incoerenti()).toEqual([]);
  });

  it('I2 · impegno e rilascio: la giacenza non si muove, il disponibile sì', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 10, 'locale'),
    );
    await prisma.$transaction((tx) =>
      applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 4, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 10, committed: 4, available: 6 });

    await prisma.$transaction((tx) =>
      applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, -4, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    expect(await incoerenti()).toEqual([]);
  });

  it('I3 · l impegno OLTRE la giacenza porta il disponibile sotto zero, non lo blocca', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 2, 'locale'),
    );
    await prisma.$transaction((tx) =>
      applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 5, 'locale'),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 2, committed: 5, available: -3 });
    expect(await incoerenti()).toEqual([]);
  });

  it('I4 · la riga che NASCE dall upsert nasce coerente (0, 0, 0)', async () => {
    // ⚠️ Un `create` che valorizzasse `onHand` lasciando `available` al default
    //    romperebbe l'invariante alla nascita: qui si verifica che non accada.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteB, IDS.locA1, 0, 'locale'),
    );
    expect(await riga(varianteB)).toMatchObject({ onHand: 0, committed: 0, available: 0 });
    expect(await incoerenti()).toEqual([]);
  });

  it('I5 · l incoming NON tocca il disponibile', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 5, 'locale'),
    );
    await prisma.$transaction((tx) => applyIncomingDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 8));
    expect(await riga(varianteA)).toMatchObject({
      onHand: 5,
      committed: 0,
      available: 5,
      incoming: 8,
    });
    expect(await incoerenti()).toEqual([]);
  });

  // ── 2 · il ROLLBACK ──────────────────────────────────────────────────────

  it('I6 · una transazione che cade DOPO il delta non lascia niente: né dato né incoerenza', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 10, 'locale'),
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, -4, 'locale');
        await applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 3, 'locale');
        // ⛔ Il guasto arriva DOPO che i due campi si sono mossi: è il caso in
        //    cui un rollback parziale lascerebbe `available` scollegato.
        throw new Error('guasto dopo le scritture');
      }),
    ).rejects.toThrow(/guasto dopo le scritture/);

    expect(await riga(varianteA)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    expect(await incoerenti()).toEqual([]);
  });

  // ── 3 · la CONCORRENZA ───────────────────────────────────────────────────

  it('I7 · dodici delta di giacenza in parallelo: nessun aggiornamento perso, invariante intatto', async () => {
    // ⚠️ La riga si crea PRIMA: la nascita concorrente è un caso a sé, ed è
    //    `I9`. Qui il bersaglio è l'aggiornamento simultaneo di una riga che
    //    già esiste, che è la situazione di ogni giorno.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 0, 'locale'),
    );
    // ⭐ Gli increment sono atomici lato database: la somma deve tornare esatta.
    //    Se qualcuno leggesse-e-riscrivesse, qui si perderebbe un aggiornamento.
    await Promise.all(
      Array.from({ length: 12 }, () =>
        prisma.$transaction((tx) =>
          applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 3, 'locale'),
        ),
      ),
    );
    expect(await riga(varianteA)).toMatchObject({ onHand: 36, committed: 0, available: 36 });
    expect(await incoerenti()).toEqual([]);
  });

  it('I8 · giacenza e impegni MESCOLATI in parallelo sulla stessa riga', async () => {
    // ⚠️ È il caso vero: un arrivo merce e un ordine cliente sulla stessa
    //    variante, nello stesso istante. I due percorsi toccano campi diversi e
    //    devono comporsi senza lasciare `available` a metà strada.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 0, 'locale'),
    );
    await Promise.all([
      ...Array.from({ length: 6 }, () =>
        prisma.$transaction((tx) =>
          applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 5, 'locale'),
        ),
      ),
      ...Array.from({ length: 6 }, () =>
        prisma.$transaction((tx) =>
          applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 2, 'locale'),
        ),
      ),
    ]);
    const dopo = await riga(varianteA);
    expect(dopo.onHand).toBe(30);
    expect(dopo.committed).toBe(12);
    expect(dopo.available).toBe(18);
    expect(await incoerenti()).toEqual([]);
  });

  it('I9 · ⚠️ LIMITE MISURATO · la riga che NASCE sotto due percorsi insieme: uno cade, e non lascia incoerenza', async () => {
    // ⛔ **Misurato il 09/09/2026, e riportato invece che aggirato.** Quando la
    //    riga di livello NON esiste ancora e due transazioni la creano nello
    //    stesso istante, l'`upsert` di una delle due fallisce con
    //
    //    ```text
    //      Unique constraint failed on the fields: (`variant_id`,`location_id`)
    //    ```
    //
    //    perché l'`upsert` di Prisma con `update: {}` non compila in un
    //    `INSERT … ON CONFLICT`: legge, non trova, e inserisce — e fra la
    //    lettura e l'inserimento l'altra transazione ha già inserito.
    //
    // ⭐ **Non è un'incoerenza, ed è la distinzione che conta**: la transazione
    //    che cade fa rollback per intero, quindi non lascia dati a metà. Il
    //    chiamante riceve un errore e l'operazione va ripetuta.
    //
    // ⚠️ **Non è nel perimetro di questo mandato**: correggerlo significa
    //    cambiare come nasce una riga di giacenza, cioè le regole di stock. Si
    //    riporta e si lascia. La prova lo tiene fermo: se un giorno l'upsert
    //    diventasse atomico, `esiti` non avrebbe più rifiuti e questa riga
    //    andrebbe riscritta di proposito.
    const esiti = await Promise.allSettled([
      prisma.$transaction((tx) =>
        applyInventoryDelta(tx, IDS.tenantA, varianteB, IDS.locA1, 4, 'locale'),
      ),
      prisma.$transaction((tx) =>
        applyCommittedDelta(tx, IDS.tenantA, varianteB, IDS.locA1, 1, 'locale'),
      ),
    ]);
    const caduti = esiti.filter((e) => e.status === 'rejected');
    for (const caduto of caduti) {
      expect(String((caduto as PromiseRejectedResult).reason)).toMatch(/Unique constraint failed/);
    }
    // ⭐ Qualunque sia stato l'esito della corsa, nessuna riga è rimasta rotta.
    expect(await incoerenti()).toEqual([]);
  });

  // ── 4 · il RIPRISTINO ────────────────────────────────────────────────────

  it('I10 · export e ripristino: i livelli tornano com erano, e coerenti', async () => {
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 9, 'locale'),
    );
    await prisma.$transaction((tx) =>
      applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 4, 'locale'),
    );
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteB, IDS.locA1, -2, 'locale'),
    );
    const prima = await riga(varianteA);

    const zip = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
    // Una modifica DOPO il backup, per vedere che il ripristino la sovrascrive.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 100, 'locale'),
    );
    await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip);

    expect(await riga(varianteA)).toMatchObject({
      onHand: prima.onHand,
      committed: prima.committed,
      available: prima.available,
    });
    // ⭐ E il negativo dell'altra variante è tornato tale e quale: il ripristino
    //    reinserisce i valori, non li ricalcola né li corregge.
    expect(await riga(varianteB)).toMatchObject({ onHand: -2, committed: 0, available: -2 });
    expect(await incoerenti()).toEqual([]);
  }, 120_000);

  // ── 5-bis · il RIPRISTINO è un percorso applicativo, e ha un cancello ────

  /**
   * ⛔ **Non si può dichiarare l'invariante protetto e accettare archivi che lo
   *    violano.** Il ripristino è un percorso applicativo come gli altri: il
   *    pacchetto arriva dal cliente e nessuno ne verificava la coerenza
   *    numerica — i campi sconosciuti erano rifiutati, i numeri no.
   *
   * ⭐ **Il cancello sta PRIMA della purga e di ogni scrittura.** Un archivio
   *    incoerente si rifiuta con il tenant intatto: niente purga, niente
   *    upload, niente transazione aperta.
   *
   * ⛔ **Nessun ricalcolo, nessun azzeramento, nessun movimento correttivo.**
   *    Un archivio che non torna si rifiuta; non si «aggiusta». Sistemare il
   *    numero significherebbe inventare quale dei tre campi è quello giusto.
   */
  describe('il cancello di coerenza del ripristino', () => {
    /** Porta la riga ai tre valori chiesti, passando dai percorsi veri. */
    async function portaA(onHand: number, committed: number): Promise<void> {
      await prisma.$transaction((tx) =>
        applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, onHand, 'locale'),
      );
      await prisma.$transaction((tx) =>
        applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, committed, 'locale'),
      );
    }

    async function esporta(): Promise<Buffer> {
      return readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
    }

    /** Riscrive `data/inventoryLevels.json` dentro un archivio già valido. */
    async function conLivelliRiscritti(
      zip: Buffer,
      cambia: (righe: Record<string, unknown>[]) => void,
    ): Promise<Buffer> {
      return rewriteTenantBackupZip(zip, (file) => {
        const percorso = `${TENANT_BACKUP_DATA_DIR}/inventoryLevels.json`;
        const righe = JSON.parse(file.get(percorso)!.toString('utf8')) as Record<string, unknown>[];
        cambia(righe);
        file.set(percorso, Buffer.from(`${JSON.stringify(righe, null, 2)}\n`));
      });
    }

    /** Tutto ciò che il rifiuto NON deve toccare. */
    async function fotografia() {
      return {
        tenant: await prisma.tenant.count({ where: { id: IDS.tenantA } }),
        livelli: await prisma.inventoryLevel.findMany({
          where: { tenantId: IDS.tenantA },
          select: { variantId: true, onHand: true, committed: true, available: true },
          orderBy: { variantId: 'asc' },
        }),
        prodotti: await prisma.product.count({ where: { tenantId: IDS.tenantA } }),
        varianti: await prisma.productVariant.count({ where: { tenantId: IDS.tenantA } }),
      };
    }

    it('R1 · 7 / 2 / 5 — coerente: si ripristina', async () => {
      await portaA(7, 2);
      const zip = await esporta();

      await expect(
        importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip),
      ).resolves.toBeDefined();

      expect(await riga(varianteA)).toMatchObject({ onHand: 7, committed: 2, available: 5 });
      expect(await incoerenti()).toEqual([]);
    }, 120_000);

    it('R2 · 7 / 2 / 7 — INCOERENTE: rifiutato, e nomina variante e sede', async () => {
      await portaA(7, 2);
      const rotto = await conLivelliRiscritti(await esporta(), (righe) => {
        const bersaglio = righe.find((r) => r['variantId'] === varianteA)!;
        bersaglio['available'] = 7;
      });
      const prima = await fotografia();

      const rifiuto = importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, rotto);

      await expect(rifiuto).rejects.toThrow(new RegExp(varianteA));
      await expect(rifiuto).rejects.toThrow(new RegExp(IDS.locA1));
      // ⭐ E il rifiuto dice i numeri, non solo che «qualcosa non torna».
      await expect(rifiuto).rejects.toThrow(/Disponibile 7/);
      // ⛔ Il tenant e i dati precedenti sono intatti: nessuna purga è avvenuta.
      expect(await fotografia()).toEqual(prima);
      expect(await incoerenti()).toEqual([]);
    }, 120_000);

    it('R3 · il campo NECESSARIO che manca: rifiutato', async () => {
      await portaA(7, 2);
      const senzaCampo = await conLivelliRiscritti(await esporta(), (righe) => {
        for (const r of righe) delete r['available'];
      });
      const prima = await fotografia();

      await expect(
        importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, senzaCampo),
      ).rejects.toThrow(/Disponibile/i);

      // ⛔ Senza il cancello questa riga nascerebbe con lo `0` di schema, cioè
      //    incoerente e in silenzio: è il caso che il censimento aveva indicato.
      expect(await fotografia()).toEqual(prima);
    }, 120_000);

    it('R4 · disponibilità NEGATIVA ma coerente: si ripristina', async () => {
      // ⭐ Il negativo è un fatto del gestionale, non un errore: 2 − 5 = −3.
      await portaA(2, 5);
      const zip = await esporta();

      await expect(
        importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip),
      ).resolves.toBeDefined();

      expect(await riga(varianteA)).toMatchObject({ onHand: 2, committed: 5, available: -3 });
    }, 120_000);

    it('R5 · gli archivi v4 e v3 legittimi si ripristinano ancora', async () => {
      // ⚠️ `inventoryLevels` esiste dal formato v3 con la stessa forma: il
      //    cancello non chiede niente che un archivio più vecchio non abbia.
      await portaA(4, 1);
      const zip = await esporta();

      for (const versione of [4, 3]) {
        const declassato = await rewriteTenantBackupZip(zip, (file) => {
          const manifest = JSON.parse(file.get('manifest.json')!.toString('utf8')) as {
            formatVersion: number;
            entityCounts: Record<string, number>;
          };
          manifest.formatVersion = versione;
          if (versione === 3) manifest.entityCounts = {};
          file.set('manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
        });
        await expect(
          importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, declassato),
        ).resolves.toBeDefined();
        expect(await riga(varianteA)).toMatchObject({ onHand: 4, committed: 1, available: 3 });
      }
    }, 180_000);
  });

  // ── 5 · la falsificazione del controllo stesso ───────────────────────────

  // ── 6 · CHI legge il numero: la sonda che distingue colonna da ricalcolo ──

  /**
   * ⛔ **Questa sonda costruisce uno stato che nessun percorso applicativo
   *    produce**, e va letta per quello che è: non dice che una riga incoerente
   *    possa esistere — il censimento e le prove da `I1` a `I10` dicono di no.
   *    Serve a una cosa sola: distinguere **quale numero** il canale riceve.
   *
   * ```text
   *   riga costruita:  onHand 9 · committed 1 · available 4
   *   ricalcolo:       9 - 1 = 8      ← quello che il push mandava prima
   *   colonna:         4              ← quello che manda adesso
   * ```
   *
   * ⭐ È anche la **falsificazione** dell'adeguamento: rimettendo il ricalcolo,
   *    queste due prove tornano rosse.
   */
  describe('la sonda del numero canonico', () => {
    const DOMINIO = 'invariante.myshopify.com';
    let negozio: NegozioSimulato;
    let inventarioItem: string;

    beforeEach(async () => {
      negozio = new NegozioSimulato(DOMINIO, 994000);
      await prisma.shopifyConnection.create({
        data: {
          tenantId: IDS.tenantA,
          status: 'connected',
          shopDomain: DOMINIO,
          scopes: ['read_products', 'write_products', 'write_inventory'],
        },
      });
      await prisma.shopifyCredential.create({
        data: {
          tenantId: IDS.tenantA,
          shopDomain: DOMINIO,
          accessTokenEnc: 'cifrato',
          scopes: ['write_inventory'],
        },
      });
      await prisma.location.update({
        where: { id: IDS.locA1 },
        data: { shopifyLocationId: '994900' },
      });
      inventarioItem = '994800';
      await prisma.productVariant.update({
        where: { id: varianteA },
        data: { shopifyVariantId: '994700', shopifyInventoryItemId: inventarioItem },
      });
      // La riga nasce dal percorso vero, poi la si sfasa di proposito.
      await prisma.$transaction((tx) =>
        applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 9, 'locale'),
      );
      await prisma.$transaction((tx) =>
        applyCommittedDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 1, 'locale'),
      );
      await prisma.$executeRawUnsafe(
        `UPDATE inventory_levels SET available = 4 WHERE tenant_id = $1::uuid AND variant_id = $2::uuid`,
        IDS.tenantA,
        varianteA,
      );
    });

    /**
     * ⚠️ **Una base confermata, e il negozio che la porta.** Dal 09/09/2026 il
     *    push non parte senza un ultimo valore confermato da cui confrontare
     *    (`base_assente`, protezione provvisoria sul primo invio). Queste sonde
     *    misurano QUALE NUMERO parte, non il primo invio: partono quindi da una
     *    coppia già pubblicata.
     */
    async function coppiaGiaPubblicata(variantId: string, remoto: number): Promise<void> {
      await prisma.shopifyInventorySyncState.deleteMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
      });
      await prisma.shopifyInventorySyncState.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
          lastPushedAvailable: remoto,
          lastPushedAt: new Date(Date.now() - 3_600_000),
        },
      });
      negozio.impostaQuantitaRemota(inventarioItem, '994900', remoto);
    }

    function creaPushInventario() {
      return new ShopifyInventoryPushService(
        prisma as never,
        negozio.oauth() as never,
        negozio.admin() as never,
        negozio.graphql() as never,
        { touchSync: vi.fn() } as never,
        new ShopifyInventoryReconciliationService(prisma as never),
        // ⚠️ Storico e registro VERI. Qui la connessione non ha `shopId`, quindi
        //    la guardia di 26.8 non parte: è il ramo «non migrata», e queste
        //    sonde misurano il NUMERO, non la protezione del collegamento.
        new ShopifyLinkHistoryService(),
        new PlatformAuditService(prisma as never, prisma as never),
      );
    }

    it('I12 · il PUSH manda il Disponibile del gestionale, non la sua differenza', async () => {
      await coppiaGiaPubblicata(varianteA, 99);
      const esito = await creaPushInventario().pushLevel(IDS.tenantA, varianteA, IDS.locA1);

      expect(esito.pushed).toBe(true);
      expect(negozio.quantitaMandate).toEqual([
        { inventoryItemId: inventarioItem, locationId: '994900', available: 4 },
      ]);
      // ⛔ 8 sarebbe il ricalcolo: se comparisse, l'adeguamento non c'è.
      expect(negozio.quantitaMandate[0]!.available).not.toBe(8);
    });

    it('I13 · la RICONCILIAZIONE confronta con lo stesso numero del push', async () => {
      const riconciliazione = new ShopifyInventoryReconciliationService(prisma as never);

      // Shopify dice 4: coincide col Disponibile del gestionale → allineato.
      expect(
        await riconciliazione.reconcileFromShopifyWebhook(IDS.tenantA, inventarioItem, '994900', 4),
      ).toBe('reconciled');

      // ⛔ 8 è il vecchio ricalcolo: oggi è un disallineamento, non un allineamento.
      expect(
        await riconciliazione.reconcileFromShopifyWebhook(IDS.tenantA, inventarioItem, '994900', 8),
      ).toBe('mismatch_republish');
    });

    it('I14 · il negativo locale resta, e al canale va zero', async () => {
      await coppiaGiaPubblicata(varianteA, 99);
      await prisma.$executeRawUnsafe(
        `UPDATE inventory_levels SET on_hand = -2, committed = 0, available = -2
          WHERE tenant_id = $1::uuid AND variant_id = $2::uuid`,
        IDS.tenantA,
        varianteA,
      );

      const esito = await creaPushInventario().pushLevel(IDS.tenantA, varianteA, IDS.locA1);

      expect(esito.pushed).toBe(true);
      expect(negozio.quantitaMandate[0]!.available).toBe(0);
      // ⭐ E il gestionale conserva il negativo: il clamp è del canale.
      expect(await riga(varianteA)).toMatchObject({ onHand: -2, available: -2 });
    });
  });

  it('I11 · il controllo VEDE un incoerenza costruita a mano', async () => {
    // ⛔ **Un controllo che non fallisce mai non è un controllo.** Qui si scrive
    //    di proposito una riga rotta — con SQL diretto, cioè per una strada che
    //    nessun percorso applicativo usa — e si verifica che venga contata.
    //    ⚠️ La riga resta rotta: non la si «sistema», si verifica e basta.
    await prisma.$transaction((tx) =>
      applyInventoryDelta(tx, IDS.tenantA, varianteA, IDS.locA1, 6, 'locale'),
    );
    await prisma.$executeRawUnsafe(
      `UPDATE inventory_levels SET available = 999 WHERE tenant_id = $1::uuid AND variant_id = $2::uuid`,
      IDS.tenantA,
      varianteA,
    );

    const rotte = await incoerenti();
    expect(rotte).toHaveLength(1);
    expect(rotte[0]).toMatchObject({ on_hand: 6, committed: 0, available: 999 });
  });
});
