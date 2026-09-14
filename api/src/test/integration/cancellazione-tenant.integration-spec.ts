import { ConfigService } from '@nestjs/config';
import { PlatformAuditActor, type PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { AdminTenantsService } from '../../admin/admin-tenants.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import type { AttoreRegistro } from '../../common/audit/platform-audit.types';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import {
  TENANT_BACKUP_DELETE_ORDER,
  TENANT_BACKUP_DELETE_ORDER_COMPLETO,
  TENANT_BACKUP_STORICO_SHOPIFY,
} from '../../tenant/tenant-backup/tenant-backup.constants';
import { attendiBloccoCausatoDa, sospendiLaPrimaRichiesta } from './concorrenza.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * A4 — la cancellazione amministrativa del tenant, tracciata (§10.2).
 *
 * ⭐ **Passa dal servizio VERO** (`AdminTenantsService.deleteTenant`): e' li'
 *    che la sequenza del registro e la cancellazione dello storico si
 *    incontrano, ed e' l'unico modo di vedere se l'invariante «tenant sparito
 *    ⇔ riga di riuscita presente» regge davvero.
 *
 * ⚠️ Le sole prove in SQL diretto sono quelle sul PERMESSO (gruppo 2): li' il
 *    bersaglio e' il trigger.
 */
describe('Cancellazione amministrativa del tenant', () => {
  let prisma: PrismaClient;
  let audit: PlatformAuditService;
  let admin: AdminTenantsService;
  let daRipristinare: Array<() => void> = [];

  const SHOP = '97000000-0000-4000-8000-00000000000a';
  const SHOP_B = '97000000-0000-4000-8000-00000000000b';
  const P1 = '95000000-0000-4000-8000-0000000000a1';
  const ID_A = '98000000-0000-4000-8000-0000000000a1';
  const PERIODO_A = '98000000-0000-4000-8000-0000000000a2';
  const P_B = '95000000-0000-4000-8000-0000000000b1';
  const ID_B = '98000000-0000-4000-8000-0000000000b1';

  const operatore: AttoreRegistro = {
    tipo: PlatformAuditActor.utente,
    userId: IDS.utenteA1,
    name: 'Operatore Piattaforma',
    email: 'admin@vestiflow.it',
  };

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    audit = new PlatformAuditService(prisma as never, prisma as never);
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    admin = new AdminTenantsService(
      prisma as never,
      // ⚠️ Nessuna cancellazione di utenti su Supabase: `isConfigured()` dice
      //    di no, e la prova resta sul database.
      new SupabaseService(config),
      new PlatformAdminService(config),
      config,
      {} as never,
      {} as never,
      new AuthProfileCacheService(),
      audit,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.platformAuditLog.deleteMany({});
    await creaStoricoPerDueTenant();
    daRipristinare = [];
  });

  afterEach(() => {
    while (daRipristinare.length > 0) {
      daRipristinare.pop()!();
    }
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  /** Due tenant, entrambi con storico: serve a vedere che l'altro non si tocca. */
  async function creaStoricoPerDueTenant(): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO products (id, tenant_id, name, article_code, updated_at) VALUES
         ($1::uuid, $3::uuid, 'Articolo A', 'A-1', now()),
         ($2::uuid, $4::uuid, 'Articolo B', 'B-1', now())`,
      P1,
      P_B,
      IDS.tenantA,
      IDS.tenantB,
    );
    for (const [shop, tenant, gidShop] of [
      [SHOP, IDS.tenantA, 'gid://shopify/Shop/9910001'],
      [SHOP_B, IDS.tenantB, 'gid://shopify/Shop/9910002'],
    ] as const) {
      await prisma.shopifyShop.create({ data: { id: shop, tenantId: tenant, shopGid: gidShop } });
    }
    await prisma.shopifyProductIdentity.create({
      data: {
        id: ID_A,
        tenantId: IDS.tenantA,
        shopId: SHOP,
        shopifyProductGid: 'gid://shopify/Product/9910011',
        originalProductId: P1,
        productId: P1,
      },
    });
    await prisma.shopifyProductLink.create({
      data: { id: PERIODO_A, tenantId: IDS.tenantA, identityId: ID_A, originalProductId: P1 },
    });
    await prisma.shopifyProductIdentity.create({
      data: {
        id: ID_B,
        tenantId: IDS.tenantB,
        shopId: SHOP_B,
        shopifyProductGid: 'gid://shopify/Product/9910012',
        originalProductId: P_B,
        productId: P_B,
      },
    });
  }

  /** Le righe di registro di un'entita', in ordine di scrittura. */
  async function registro(entityId: string) {
    return prisma.platformAuditLog.findMany({
      where: { entityId },
      orderBy: { createdAt: 'asc' },
      select: {
        outcome: true,
        operation: true,
        tenantId: true,
        actorUserId: true,
        actorName: true,
        actorEmail: true,
        entityLabel: true,
        detail: true,
      },
    });
  }

  /** Sostituisce `$transaction` perche' commetta e poi perda la risposta. */
  function perdiLaRispostaDopoIlCommit(): void {
    const client = prisma as unknown as {
      $transaction: (...argomenti: unknown[]) => Promise<unknown>;
    };
    const originale = client.$transaction.bind(prisma);
    daRipristinare.push(() => {
      client.$transaction = originale;
    });
    client.$transaction = async (...argomenti: unknown[]) => {
      client.$transaction = originale;
      await originale(...argomenti);
      throw new Error('connessione persa dopo il commit');
    };
  }

  /** Sostituisce `$transaction` perche' la transazione parta e NON venga attesa. */
  function perdiLaRispostaMentreEInVolo(quandoRinunciare: () => Promise<unknown>): {
    readonly inVolo: Promise<unknown>;
  } {
    const client = prisma as unknown as {
      $transaction: (...argomenti: unknown[]) => Promise<unknown>;
    };
    const originale = client.$transaction.bind(prisma);
    daRipristinare.push(() => {
      client.$transaction = originale;
    });
    const scatola = { inVolo: Promise.resolve() as Promise<unknown> };
    client.$transaction = async (...argomenti: unknown[]) => {
      client.$transaction = originale;
      const inVolo = originale(...argomenti);
      inVolo.catch(() => undefined);
      scatola.inVolo = inVolo;
      await quandoRinunciare();
      throw new Error('timeout del client: la transazione e ancora in volo');
    };
    return scatola;
  }

  // ── 1 · La sequenza, e la traccia che sopravvive ─────────────────────────

  it('1a · il tenant sparisce, e la sua traccia RESTA', async () => {
    await admin.deleteTenant(IDS.tenantA, operatore);

    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } })).toBe(0);

    // ⭐ La traccia porta il tenant come TESTO, e nessuna FK la trascina via.
    const righe = await registro(IDS.tenantA);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
    expect(righe[1]!.operation).toBe('cancellazione_tenant');
    expect(righe[1]!.tenantId).toBe(IDS.tenantA);
    expect(righe[1]!.entityLabel).toBe('Tenant A — integrazione');
    // ⭐ `displayName` come nome, `email` nel campo dedicato.
    expect(righe[1]!.actorName).toBe('Operatore Piattaforma');
    expect(righe[1]!.actorEmail).toBe('admin@vestiflow.it');
  });

  it('1b · rotta la scrittura della RIUSCITA, il tenant non sparisce', async () => {
    // ⭐ Il fallimento e` del DATABASE, non un `throw` finto: la riga viola
    //    `…_utente_ha_un_nome`, e a rotolare indietro e` PostgreSQL.
    const rotto = new PlatformAuditService(prisma as never, prisma as never);
    rotto.registraRiuscita = async (tx) => {
      await (tx as unknown as PrismaClient).$executeRawUnsafe(
        `INSERT INTO platform_audit_logs (id, correlation_id, tenant_id, actor, operation, outcome)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1::uuid, 'utente', 'cancellazione_tenant', 'riuscita')`,
        IDS.tenantA,
      );
    };
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const conRegistroRotto = new AdminTenantsService(
      prisma as never,
      new SupabaseService(config),
      new PlatformAdminService(config),
      config,
      {} as never,
      {} as never,
      new AuthProfileCacheService(),
      rotto,
    );

    await expect(conRegistroRotto.deleteTenant(IDS.tenantA, operatore)).rejects.toThrow(
      /platform_audit_logs_utente_ha_un_nome/,
    );

    // ⭐ L'invariante regge: niente riuscita, niente cancellazione.
    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(1);
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    const righe = await registro(IDS.tenantA);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'fallita']);

    // ⛔ **E NESSUNA riuscita e` sopravvissuta, da nessuna parte.** Non e` una
    //    ripetizione della riga sopra: quella guarda le righe di QUESTA
    //    entita`, questa guarda il tenant intero. E` l'asserzione che
    //    distingue una riuscita scritta DENTRO la transazione — che il
    //    rollback porta via — da una scritta fuori, che sopravvive e lascia a
    //    verbale un successo che non c'e` stato. Senza, il difetto «riuscita
    //    fuori dalla transazione» non arrossisce: misurato l'08/09/2026.
    expect(
      await prisma.platformAuditLog.count({
        where: { tenantId: IDS.tenantA, outcome: 'riuscita' },
      }),
    ).toBe(0);
  });

  it('1e · la RIUSCITA sta DENTRO la transazione: un fallimento successivo se la porta via', async () => {
    // ⛔ **Questa prova esiste per una lacuna misurata l'08/09/2026**: spostando
    //    la riuscita fuori dalla transazione, le altre dodici restavano verdi.
    //    In `1b` la scrittura fallisce comunque — dentro o fuori — quindi non
    //    distingue. Qui la riuscita RIESCE, e a cadere e` cio` che viene dopo:
    //    e` l'unico modo di vedere se quella riga se ne va col rollback.
    const rotto = new PlatformAuditService(prisma as never, prisma as never);
    const originale = rotto.registraRiuscita.bind(rotto);
    rotto.registraRiuscita = async (tx, correlazione, dati) => {
      await originale(tx, correlazione, dati);
      throw new Error('il registro ha scritto, poi il processo e caduto');
    };
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const servizio = new AdminTenantsService(
      prisma as never,
      new SupabaseService(config),
      new PlatformAdminService(config),
      config,
      {} as never,
      {} as never,
      new AuthProfileCacheService(),
      rotto,
    );

    await expect(servizio.deleteTenant(IDS.tenantA, operatore)).rejects.toThrow(
      /poi il processo e caduto/,
    );

    // ⭐ L'INVARIANTE di §10.2: tenant sparito ⇔ riga di riuscita presente.
    //    Qui il tenant c'e` ancora, quindi la riuscita non deve esistere.
    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(1);
    expect(
      await prisma.platformAuditLog.count({
        where: { tenantId: IDS.tenantA, outcome: 'riuscita' },
      }),
    ).toBe(0);
  });

  it('1c · risposta persa DOPO il commit: nessuna fallita accanto alla riuscita', async () => {
    perdiLaRispostaDopoIlCommit();

    await expect(admin.deleteTenant(IDS.tenantA, operatore)).rejects.toThrow(
      /connessione persa dopo il commit/,
    );

    // ⛔ Il tenant e` sparito davvero: dedurne un fallimento sarebbe una bugia.
    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(0);
    const righe = await registro(IDS.tenantA);
    expect(righe.map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
    expect(righe.filter((r) => r.outcome === 'fallita')).toHaveLength(0);
  });

  it('1d · transazione ancora IN VOLO: esito incerto, e poi si conclude', async () => {
    // Un'altra sessione tiene la riga del tenant: la cancellazione si fermera`
    // sul lock, viva, e in grado di commettere piu` tardi.
    //
    // ⚠️ **`SELECT … FOR UPDATE`, non un `UPDATE`**, e la differenza e` la
    //    correzione di A4: la cancellazione gira in `Serializable`, e una
    //    SCRITTURA concorrente sulla stessa riga la fa abortire con un errore
    //    di serializzazione appena il blocco si libera — cioe` non arriva mai a
    //    concludersi, che e` proprio cio` che questa prova deve osservare.
    //    Il lock senza scrittura crea la finestra e non la avvelena.
    const prima = await sospendiLaPrimaRichiesta(
      prisma,
      `SELECT id FROM tenants WHERE id = $1::uuid FOR UPDATE`,
      [IDS.tenantA],
    );
    const volo = perdiLaRispostaMentreEInVolo(() => attendiBloccoCausatoDa(prisma, prima.pid));

    try {
      await expect(admin.deleteTenant(IDS.tenantA, operatore)).rejects.toThrow(/ancora in volo/);
      // ⛔ La transazione non e` terminata: non si e` accertato nessun rollback.
      expect((await registro(IDS.tenantA)).map((r) => r.outcome)).toEqual(['tentativo']);
    } finally {
      prima.sblocca();
      await Promise.allSettled([prima.transazione, volo.inVolo]);
    }

    // ⭐ E infatti si conclude da se`: l'esito vero e` `riuscita`.
    expect((await registro(IDS.tenantA)).map((r) => r.outcome)).toEqual([
      'tentativo',
      'riuscita',
    ]);
    expect(await prisma.tenant.count({ where: { id: IDS.tenantA } })).toBe(0);
  });

  // ── 2 · Il permesso di riga ──────────────────────────────────────────────

  it('2a · SENZA permesso lo storico non si cancella', async () => {
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM shopify_product_links WHERE id = $1::uuid`, PERIODO_A),
    ).rejects.toThrow(/non si cancella/);
  });

  it('2b · permesso acceso su un ALTRO tenant: le righe di questo restano protette', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
          IDS.tenantB,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_product_links WHERE id = $1::uuid`,
          PERIODO_A,
        );
      }),
    ).rejects.toThrow(/non si cancella/);
    expect(await prisma.shopifyProductLink.count({ where: { id: PERIODO_A } })).toBe(1);
  });

  it('2c · col permesso GIUSTO riesce, e dopo il COMMIT il permesso non c e` piu`', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(`DELETE FROM shopify_product_links WHERE id = $1::uuid`, PERIODO_A);
    });
    expect(await prisma.shopifyProductLink.count({ where: { id: PERIODO_A } })).toBe(0);

    // ⛔ Fuori dalla transazione il permesso e` finito con lei.
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM shopify_product_identities WHERE id = $1::uuid`,
        ID_A,
      ),
    ).rejects.toThrow(/non si cancella/);
  });

  it('2d · dopo un ROLLBACK il permesso non sopravvive, e la riga nemmeno', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_product_links WHERE id = $1::uuid`,
          PERIODO_A,
        );
        throw new Error('rollback voluto');
      }),
    ).rejects.toThrow(/rollback voluto/);

    expect(await prisma.shopifyProductLink.count({ where: { id: PERIODO_A } })).toBe(1);
  });

  it('2e · una connessione RIUSATA dal pool non si porta dietro il permesso', async () => {
    let pidUsato = 0;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantA,
      );
      const righe = await (tx as unknown as PrismaClient).$queryRawUnsafe<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      pidUsato = righe[0]!.pid;
    });

    let ricaduto = false;
    for (let tentativo = 0; tentativo < 40 && !ricaduto; tentativo += 1) {
      const righe = await prisma.$queryRawUnsafe<{ pid: number; permesso: string | null }[]>(
        `SELECT pg_backend_pid() AS pid,
                current_setting('vestiflow.cancellazione_tenant', true) AS permesso`,
      );
      expect(righe[0]!.permesso ?? '').toBe('');
      if (righe[0]!.pid === pidUsato) ricaduto = true;
    }
    // ⚠️ Se non si ricade mai sulla stessa connessione la prova non ha
    //    verificato quello che dichiara, e deve dirlo invece di passare.
    expect(ricaduto).toBe(true);
  });

  it('2f · il TRUNCATE resta vietato ANCHE a permesso acceso', async () => {
    // ⭐ E` la ragione delle due funzioni distinte: un TRUNCATE non distingue
    //    un tenant dall'altro, quindi non puo` essere autorizzato «per uno».
    //
    // ⚠️ Si tronca `shopify_variant_links`, che e` una FOGLIA. Su
    //    `shopify_product_links` PostgreSQL rifiuta prima, con `0A000` —
    //    «cannot truncate a table referenced in a foreign key constraint» — e
    //    la prova sarebbe passata senza che il trigger fosse mai entrato in
    //    gioco. Misurato l'08/09/2026, alla prima esecuzione.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(`TRUNCATE TABLE shopify_variant_links`);
      }),
    ).rejects.toThrow(/shopify_storico_non_si_cancella/);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
  });

  // ── 3 · Isolamento e regressioni ─────────────────────────────────────────

  it('3a · lo storico di un ALTRO tenant resta intatto', async () => {
    await admin.deleteTenant(IDS.tenantA, operatore);

    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
    expect(await prisma.shopifyShop.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
    expect(await prisma.tenant.count({ where: { id: IDS.tenantB } })).toBe(1);
  });

  it('3b-bis · un tenant senza Shopify e CON DATI si cancella, e senza chiedere identita`', async () => {
    // ⛔ **Un tenant vuoto non prova niente**: il rischio e` che le modifiche
    //    all'integrazione rendano Shopify una dipendenza del gestionale. La
    //    prova serve su dati veri.
    //
    // ⚠️ Il tenant B non ha connessione, ne` credenziale, ne` `shop_id`: solo
    //    la riga di negozio creata dalla fixture, che qui si toglie per
    //    lasciarlo davvero senza Shopify.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(`DELETE FROM shopify_product_identities WHERE id = $1::uuid`, ID_B);
    });
    await prisma.shopifyShop.delete({ where: { id: SHOP_B } });

    // I dati che il tenant B ha davvero, dalla fixture condivisa.
    const documentiPrima = await prisma.document.count({ where: { tenantId: IDS.tenantB } });
    const prodottiPrima = await prisma.product.count({ where: { tenantId: IDS.tenantB } });
    expect(documentiPrima).toBeGreaterThan(0);
    expect(prodottiPrima).toBeGreaterThan(0);
    // ⭐ E nessuna traccia di Shopify: e` il presupposto della prova.
    expect(await prisma.shopifyShop.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
    expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
    expect(await prisma.shopifyCredential.count({ where: { tenantId: IDS.tenantB } })).toBe(0);

    await admin.deleteTenant(IDS.tenantB, operatore);

    expect(await prisma.tenant.count({ where: { id: IDS.tenantB } })).toBe(0);
    expect(await prisma.document.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
    // ⭐ La traccia c'e` comunque: non dipende da Shopify.
    expect((await registro(IDS.tenantB)).map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
    // ⛔ E il tenant A, che Shopify ce l'ha, non e` stato sfiorato.
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
  });

  it('3b · un tenant SENZA Shopify si cancella come prima', async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM shopify_product_links WHERE tenant_id = $1::uuid`,
      IDS.tenantB,
    ).catch(() => undefined);
    // Il tenant B ha un'identita`: la si toglie col permesso, per lasciarlo nudo.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(`DELETE FROM shopify_product_identities WHERE id = $1::uuid`, ID_B);
    });
    await prisma.shopifyShop.delete({ where: { id: SHOP_B } });

    await admin.deleteTenant(IDS.tenantB, operatore);

    expect(await prisma.tenant.count({ where: { id: IDS.tenantB } })).toBe(0);
    expect((await registro(IDS.tenantB)).map((r) => r.outcome)).toEqual(['tentativo', 'riuscita']);
  });

  it('3c · il RIPRISTINO da backup non cancella lo storico: sono due ordini diversi', () => {
    for (const key of TENANT_BACKUP_STORICO_SHOPIFY) {
      expect(TENANT_BACKUP_DELETE_ORDER).not.toContain(key);
      expect(TENANT_BACKUP_DELETE_ORDER_COMPLETO).toContain(key);
    }
    // ⭐ E l'ordine completo cancella le CONNESSIONI prima dei negozi a cui
    //    puntano: e` la ragione per cui non serve una seconda sequenza a mano.
    const completo = [...TENANT_BACKUP_DELETE_ORDER_COMPLETO];
    expect(completo.indexOf('shopifyConnections')).toBeLessThan(
      completo.indexOf('shopifyShops'),
    );
    expect(completo.indexOf('shopifyProductLinks')).toBeLessThan(
      completo.indexOf('shopifyProductIdentities'),
    );
  });
});
