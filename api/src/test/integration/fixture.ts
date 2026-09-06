import type { PrismaClient } from '@prisma/client';
import { DocumentStatus, DocumentType, UserRole } from '@prisma/client';

import { ambienteIntegrazione } from './env';

/**
 * Il dataset minimo del Passo 5, creato nel SOLO database di prova.
 *
 * ```text
 *   Tenant A ── Location A1  ← l'utente limitato è assegnato qui
 *            └─ Location A2
 *   Tenant B ── Location B1
 * ```
 *
 * ⛔ **Non usa il seed generale** (`prisma/seed.mjs`, 635 righe, tenant
 *    «Sandbox locale»): quello descrive un'azienda verosimile, questo descrive
 *    l'esatta configurazione che le prove interrogano. Un dataset condiviso
 *    farebbe dipendere l'esito da dati che nessuno di questi test dichiara.
 */

export const IDS = {
  tenantA: '0a000000-0000-4000-8000-00000000000a',
  tenantB: '0b000000-0000-4000-8000-00000000000b',
  locA1: '1a100000-0000-4000-8000-00000000a001',
  locA2: '1a200000-0000-4000-8000-00000000a002',
  locB1: '1b100000-0000-4000-8000-00000000b001',
  /** Commesso del Tenant A, assegnato alla SOLA A1. */
  utenteA1: '2a100000-0000-4000-8000-00000000a101',
  authA1: '3a100000-0000-4000-8000-00000000a201',
  /** Stesso tenant, stessa sede, ma con `inventory.view_all_locations`. */
  utenteSupervisore: '2a900000-0000-4000-8000-00000000a901',
  authSupervisore: '3a900000-0000-4000-8000-00000000a902',
  /** Documenti: uno per sede, per interrogarli per ID. */
  docA1: '4a100000-0000-4000-8000-00000000d001',
  docA2: '4a200000-0000-4000-8000-00000000d002',
  docB1: '4b100000-0000-4000-8000-00000000d003',
  /** Un DDT di vendita in A2: serve come RIFERIMENTO passato per ID. */
  ddtA2: '4a200000-0000-4000-8000-00000000d004',
} as const;

/**
 * ⛔ **La barriera si ri-verifica PRIMA di ogni troncamento, non solo
 *    all'avvio.** `ambienteIntegrazione()` lancia se host, porta o nome del
 *    database non sono esattamente quelli del container. Fidarsi della
 *    validazione fatta in `setup.ts` lascerebbe l'operazione distruttiva senza
 *    rete propria — e questa è l'unica funzione del file che cancella dati.
 */
export async function svuota(prisma: PrismaClient): Promise<void> {
  const ambiente = ambienteIntegrazione();
  if (ambiente.host !== 'localhost:5433' || ambiente.database !== 'vestiflow_test') {
    throw new Error(
      `⛔ TRUNCATE rifiutato: ${ambiente.host}/${ambiente.database} non è il database di prova.`,
    );
  }

  // Solo le tabelle che queste prove toccano, in ordine di dipendenza.
  // `CASCADE` copre le righe figlie senza doverle elencare tutte.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "invoice_sales_ddt_links", "document_lines", "documents", ' +
      '"user_locations", "users", "locations", "tenants" RESTART IDENTITY CASCADE',
  );
}

/** Crea il dataset. Idempotente: svuota prima di scrivere. */
export async function creaDataset(prisma: PrismaClient): Promise<void> {
  await svuota(prisma);

  await prisma.tenant.createMany({
    data: [
      { id: IDS.tenantA, name: 'Tenant A — integrazione' },
      { id: IDS.tenantB, name: 'Tenant B — integrazione' },
    ],
  });

  await prisma.location.createMany({
    data: [
      { id: IDS.locA1, tenantId: IDS.tenantA, name: 'A1 — sede assegnata', licensedInVf: true },
      { id: IDS.locA2, tenantId: IDS.tenantA, name: 'A2 — sede NON assegnata', licensedInVf: true },
      { id: IDS.locB1, tenantId: IDS.tenantB, name: 'B1 — altro tenant', licensedInVf: true },
    ],
  });

  // ⚠️ I permessi sono quelli REALI del ruolo: il gate di sezione deve passare,
  //    altrimenti si misurerebbe un 403 di permesso invece che di sede — e la
  //    prova direbbe la cosa giusta per la ragione sbagliata.
  // ⚠️ I nomi sono quelli generati da `docViewPermission`/`docManagePermission`
  //    sulle famiglie di `DOCUMENT_PERMISSION_FAMILIES`: la famiglia della
  //    fattura si chiama `invoice`, non `sales_invoice`.
  const permessiDocumenti = [
    'section.documents',
    'section.inventory',
    'section.sales',
    'doc.invoice.view',
    'doc.invoice.manage',
    'doc.sales_ddt.view',
    'doc.sales_ddt.manage',
    'inventory.manage',
    'retail.register',
  ];

  await prisma.user.createMany({
    data: [
      {
        id: IDS.utenteA1,
        tenantId: IDS.tenantA,
        authUserId: IDS.authA1,
        email: 'commesso.a1@integrazione.local',
        displayName: 'Commesso A1',
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: false,
        permissions: permessiDocumenti,
      },
      {
        id: IDS.utenteSupervisore,
        tenantId: IDS.tenantA,
        authUserId: IDS.authSupervisore,
        email: 'supervisore@integrazione.local',
        displayName: 'Supervisore multi-sede',
        role: UserRole.clerk,
        isActive: true,
        hasAllLocationsAccess: false,
        // ⭐ È il permesso che distingue LETTURA da SCRITTURA: la prima lo
        //    onora, la seconda no. Serve a dimostrare che restano due cose.
        permissions: [...permessiDocumenti, 'inventory.view_all_locations'],
      },
    ],
  });

  // Entrambi assegnati alla SOLA A1: la differenza fra i due è il permesso.
  await prisma.userLocation.createMany({
    data: [
      { userId: IDS.utenteA1, locationId: IDS.locA1, tenantId: IDS.tenantA },
      { userId: IDS.utenteSupervisore, locationId: IDS.locA1, tenantId: IDS.tenantA },
    ],
  });

  const documento = (id: string, tenantId: string, locationId: string, numero: number) => ({
    id,
    tenantId,
    locationId,
    type: DocumentType.invoice,
    status: DocumentStatus.draft,
    year: 2026,
    number: numero,
    documentDate: new Date('2026-08-01'),
    // Obbligatorio nello schema: e lo snapshot di chi ha creato il
    // documento, che resta anche se l’utente viene poi rimosso.
    createdByName: 'Fixture integrazione',
  });

  await prisma.document.createMany({
    data: [
      documento(IDS.docA1, IDS.tenantA, IDS.locA1, 1),
      documento(IDS.docA2, IDS.tenantA, IDS.locA2, 2),
      documento(IDS.docB1, IDS.tenantB, IDS.locB1, 3),
      {
        ...documento(IDS.ddtA2, IDS.tenantA, IDS.locA2, 4),
        type: DocumentType.sales_ddt,
      },
    ],
  });
}
