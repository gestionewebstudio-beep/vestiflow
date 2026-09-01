import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';

import { canManageDocumentType } from '../auth/document-permission.util';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import type { Paginated } from '../common/dto/pagination.dto';
import {
  CUSTOMER_PARTY_INCLUDE,
  toCustomerView,
  type CustomerView,
  type CustomerWithParty,
} from '../common/party/party-views';
import { partyDuplicateData } from '../common/party-duplicate.util';
import { PrismaService } from '../prisma/prisma.service';
import { nextNumericSupplierCode } from '../supplier-orders/supplier-code.util';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import { pageWindow } from '../common/dto/unpaged.util';

type PartyWriteData = {
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  vatNumber?: string | null;
  taxCode?: string | null;
  email?: string | null;
  pec?: string | null;
  sdiCode?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  iban?: string | null;
  website?: string | null;
  contactName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  notes?: string | null;
};

type CustomerRoleWriteData = {
  code?: string | null;
  isActive?: boolean;
  customerDiscount?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  transportResponsible?: string | null;
  documentCreationAlert?: string | null;
  documentCreationNote?: string | null;
  commercialNotes?: string | null;
};

/** Campi del soggetto owned da Shopify per i clienti sincronizzati (read-only). */
const SHOPIFY_OWNED_PARTY_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'notes',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'countryCode',
] as const satisfies readonly (keyof PartyWriteData)[];

/**
 * Anagrafica clienti come RUOLO del soggetto canonico (Party): i dati comuni
 * vivono una sola volta sul soggetto, qui restano i dati commerciali.
 * La spunta "È anche fornitore" aggiunge/riattiva il ruolo fornitore sullo
 * STESSO soggetto senza copiare nulla; la disattivazione esclude il ruolo
 * dai nuovi utilizzi senza eliminare dati, documenti o storico.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Elenco completo dei ruoli attivi (select inline Ordine cliente), speculare a suppliers/all. */
  async listAll(tenantId: string): Promise<CustomerView[]> {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId, isActive: true },
      include: CUSTOMER_PARTY_INCLUDE,
      orderBy: [
        { party: { lastName: 'asc' } },
        { party: { firstName: 'asc' } },
        { party: { companyName: 'asc' } },
      ],
    });
    return rows.map(toCustomerView);
  }

  async list(tenantId: string, query: ListCustomersQueryDto): Promise<Paginated<CustomerView>> {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(query.active ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { party: { firstName: { contains: search, mode: 'insensitive' } } },
              { party: { lastName: { contains: search, mode: 'insensitive' } } },
              { party: { companyName: { contains: search, mode: 'insensitive' } } },
              { party: { email: { contains: search, mode: 'insensitive' } } },
              { party: { vatNumber: { contains: search, mode: 'insensitive' } } },
              { party: { phone: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: CUSTOMER_PARTY_INCLUDE,
        orderBy: [
          { party: { lastName: 'asc' } },
          { party: { firstName: 'asc' } },
          { party: { companyName: 'asc' } },
        ],
        // ⚠️ `pageWindow`, non `skip`/`take` a mano: con `all=1` la finestra deve
        //    SPARIRE, non diventare grande. È la funzione che usano documenti,
        //    ordini e prodotti — quattro modi di dire «tutto» sarebbero quattro
        //    modi di sbagliarlo.
        ...pageWindow(query),
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map(toCustomerView),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(tenantId: string, id: string): Promise<CustomerView> {
    return toCustomerView(await this.getRowById(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateCustomerDto,
    user?: UserProfileDto,
  ): Promise<CustomerView> {
    // Un soggetto appena creato non ha ancora il ruolo fornitore: lo stato di
    // partenza è sempre «non è fornitore», quindi solo la spunta ATTIVA sposta
    // l'operazione sull'anagrafica gemella. Prima di ogni effetto.
    this.assertSupplierRoleChangeAllowed(dto.alsoSupplier, false, user);
    const partyData = this.normalizePartyWrite(dto);
    const roleData = this.normalizeRoleWrite(dto);
    this.assertIdentityPresent(partyData);

    const created = await this.prisma.$transaction(async (tx) => {
      if (roleData.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code);
      }
      const code = roleData.code ?? (await this.allocateNextCustomerCode(tx, tenantId));

      const party = await tx.party.create({
        data: { tenantId, ...partyData },
        select: { id: true },
      });
      const customer = await tx.customer.create({
        data: { tenantId, partyId: party.id, ...roleData, code },
        select: { id: true, partyId: true },
      });

      if (dto.alsoSupplier) {
        await this.setSupplierRoleTx(tx, tenantId, customer, true);
      }

      return customer.id;
    });

    return this.getById(tenantId, created);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
    user?: UserProfileDto,
  ): Promise<CustomerView> {
    const existing = await this.getRowById(tenantId, id);
    // Subito dopo la lettura dello stato attuale e prima di qualunque
    // scrittura: la spunta va confrontata con il ruolo fornitore che il
    // soggetto ha adesso, perché è la DIFFERENZA a toccare l'altra anagrafica.
    this.assertSupplierRoleChangeAllowed(
      dto.alsoSupplier,
      existing.party.supplierRole?.isActive ?? false,
      user,
    );
    const partyData = this.normalizePartyWrite(dto, existing.shopifyCustomerId != null);
    const roleData = this.normalizeRoleWrite(dto);
    this.assertIdentityPresent({
      companyName: existing.party.companyName,
      firstName: existing.party.firstName,
      lastName: existing.party.lastName,
      ...partyData,
    });

    await this.prisma.$transaction(async (tx) => {
      if (roleData.code !== undefined && roleData.code !== existing.code) {
        await this.assertCodeAvailable(tx, tenantId, roleData.code, id);
      }

      await tx.customer.update({ where: { id }, data: roleData });
      if (Object.keys(partyData).length > 0) {
        await tx.party.update({ where: { id: existing.partyId }, data: partyData });
      }

      if (dto.alsoSupplier === true) {
        await this.setSupplierRoleTx(tx, tenantId, existing, true);
      } else if (dto.alsoSupplier === false) {
        await this.setSupplierRoleTx(tx, tenantId, existing, false);
      }
    });

    return this.getById(tenantId, id);
  }

  /**
   * Speculare a `SuppliersService.assertCustomerRoleChangeAllowed`. Senza
   * questa guardia, la spunta «È anche fornitore» del form cliente crea (o
   * disattiva) un'anagrafica FORNITORE con il solo `customers.manage` chiesto
   * dalla rotta: nascerebbe un fornitore — sceglibile in ordini fornitore,
   * arrivi merce e registrazioni fattura — senza `doc.supplier_order.manage`,
   * che è il permesso con cui l'anagrafica fornitori si scrive davvero.
   *
   * Il controllo scatta anche in RIMOZIONE (`false` su un ruolo attivo):
   * disattivare il ruolo fornitore lo toglie da ogni nuovo documento
   * d'acquisto, ed è una scrittura sull'altra anagrafica come aggiungerlo.
   *
   * NON scatta quando la spunta arriva uguale a com'è già: la maschera manda
   * il campo a ogni salvataggio (`alsoSupplier: raw.alsoSupplier ?? false`), e
   * chiedere il permesso sulla sola PRESENZA bloccherebbe ogni modifica di
   * cliente a chi non gestisce gli ordini fornitore.
   *
   * Senza utente in contesto (chiamate interne, lavori di sistema) non si
   * decide nulla: l'autorizzazione l'ha già data chi ha avviato l'operazione.
   */
  private assertSupplierRoleChangeAllowed(
    requested: boolean | undefined,
    current: boolean,
    user?: UserProfileDto,
  ): void {
    if (!user || requested === undefined || requested === current) {
      return;
    }
    if (!canManageDocumentType(user, DocumentType.supplier_order)) {
      throw new ForbiddenException(
        'Non hai il permesso di gestire i fornitori: la spunta «È anche fornitore» non è disponibile.',
      );
    }
  }

  /** Prossimo codice cliente progressivo (anteprima nel form). */
  async previewNextCode(tenantId: string): Promise<{ readonly code: string }> {
    const code = await this.allocateNextCustomerCode(this.prisma, tenantId);
    return { code };
  }

  /**
   * Attiva/disattiva il ruolo CLIENTE del soggetto di un fornitore
   * (spunta "È anche cliente" nella scheda fornitore). Nessuna copia dati:
   * il ruolo si aggancia allo stesso soggetto; la disattivazione conserva
   * la riga (e quindi documenti e storico), escludendola dai nuovi utilizzi.
   */
  async setCustomerRoleForSupplier(
    tenantId: string,
    supplierId: string,
    enabled: boolean,
  ): Promise<CustomerView | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      include: { party: { include: { customerRole: { select: { id: true } } } } },
    });
    if (!supplier) {
      throw new NotFoundException('Fornitore non trovato');
    }

    const existingRole = supplier.party.customerRole;

    if (!enabled) {
      if (!existingRole) {
        return null;
      }
      await this.prisma.customer.update({
        where: { id: existingRole.id },
        data: { isActive: false },
      });
      return this.getById(tenantId, existingRole.id);
    }

    if (existingRole) {
      await this.prisma.customer.update({
        where: { id: existingRole.id },
        data: { isActive: true },
      });
      return this.getById(tenantId, existingRole.id);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const code = await this.allocateNextCustomerCode(tx, tenantId);
      return tx.customer.create({
        data: { tenantId, partyId: supplier.partyId, code },
        select: { id: true },
      });
    });
    return this.getById(tenantId, created.id);
  }

  private async getRowById(tenantId: string, id: string): Promise<CustomerWithParty> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: CUSTOMER_PARTY_INCLUDE,
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato');
    }
    return customer;
  }

  /**
   * Attiva/disattiva il ruolo FORNITORE del soggetto del cliente
   * (spunta "È anche fornitore"). Attivazione senza copia dati; la
   * disattivazione conserva riga, documenti e collegamenti storici.
   */
  private async setSupplierRoleTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customer: { readonly partyId: string },
    enabled: boolean,
  ): Promise<void> {
    const existingRole = await tx.supplier.findUnique({
      where: { partyId: customer.partyId },
      select: { id: true, isActive: true },
    });

    if (!enabled) {
      if (existingRole && existingRole.isActive) {
        await tx.supplier.update({
          where: { id: existingRole.id },
          data: { isActive: false },
        });
      }
      return;
    }

    if (existingRole) {
      if (!existingRole.isActive) {
        await tx.supplier.update({
          where: { id: existingRole.id },
          data: { isActive: true },
        });
      }
      return;
    }

    const code = await this.allocateNextSupplierCode(tx, tenantId);
    await tx.supplier.create({
      data: { tenantId, partyId: customer.partyId, code },
    });
  }

  private async allocateNextCustomerCode(
    tx: Prisma.TransactionClient | PrismaService,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.customer.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    return nextNumericSupplierCode(rows.map((row) => row.code ?? '').filter(Boolean));
  }

  private async allocateNextSupplierCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const rows = await tx.supplier.findMany({
      where: { tenantId, code: { not: null } },
      select: { code: true },
    });
    return nextNumericSupplierCode(rows.map((row) => row.code ?? '').filter(Boolean));
  }

  private async assertCodeAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!code) {
      return;
    }
    const existing = await tx.customer.findFirst({
      where: {
        tenantId,
        code,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException(`Codice cliente "${code}" già in uso`);
    }
  }

  /** Denominazione obbligatoria: ragione sociale oppure nome e cognome. */
  private assertIdentityPresent(party: PartyWriteData): void {
    const hasCompany = Boolean(party.companyName?.trim());
    const hasPerson = Boolean(party.firstName?.trim()) && Boolean(party.lastName?.trim());
    if (!hasCompany && !hasPerson) {
      throw new UnprocessableEntityException(
        'Indica la ragione sociale oppure nome e cognome del cliente',
      );
    }
  }

  private normalizePartyWrite(
    dto: CreateCustomerDto | UpdateCustomerDto,
    shopifyOwned = false,
  ): PartyWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: PartyWriteData = {};
    const assign = (key: keyof PartyWriteData, value: string | undefined): void => {
      const normalized = trim(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    };

    assign('companyName', dto.companyName);
    assign('firstName', dto.firstName);
    assign('lastName', dto.lastName);
    assign('vatNumber', dto.vatNumber);
    assign('taxCode', dto.taxCode);
    assign('email', dto.email);
    assign('pec', dto.pec);
    assign('sdiCode', dto.sdiCode);
    assign('phone', dto.phone);
    assign('mobilePhone', dto.mobilePhone);
    assign('iban', dto.iban);
    assign('website', dto.website);
    assign('contactName', dto.contactName);
    assign('addressLine1', dto.addressLine1);
    assign('addressLine2', dto.addressLine2);
    assign('city', dto.city);
    assign('province', dto.province);
    assign('postalCode', dto.postalCode);
    assign('countryCode', dto.countryCode);
    assign('notes', dto.notes);

    if (shopifyOwned) {
      for (const field of SHOPIFY_OWNED_PARTY_FIELDS) {
        delete result[field];
      }
    }

    return result;
  }

  private normalizeRoleWrite(dto: CreateCustomerDto | UpdateCustomerDto): CustomerRoleWriteData {
    const trim = (value: string | undefined): string | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const result: CustomerRoleWriteData = {};
    const assign = (
      /*
        ⚠️ **`isActive` è escluso**: questo aiuto normalizza STRINGHE — taglia
        gli spazi e trasforma il vuoto in `null` — e su un booleano non ha
        senso, perché `false` è un valore e non un'assenza. Si assegna da sé,
        più sotto.
      */
      key: Exclude<keyof CustomerRoleWriteData, 'isActive'>,
      value: string | undefined,
    ): void => {
      const normalized = trim(value);
      if (normalized !== undefined) {
        result[key] = normalized;
      }
    };

    assign('code', dto.code);
    assign('customerDiscount', dto.customerDiscount);
    assign('paymentMethod', dto.paymentMethod);
    assign('paymentTerms', dto.paymentTerms);
    assign('transportResponsible', dto.transportResponsible);
    assign('documentCreationAlert', dto.documentCreationAlert);
    assign('documentCreationNote', dto.documentCreationNote);
    assign('commercialNotes', dto.commercialNotes);

    /*
      ⚠️ **Non passa da `assign`**, che è scritto per le stringhe e le taglia:
      qui il valore è un booleano, e `false` è un valore vero — non un vuoto
      da normalizzare a `null`.
    */
    if (dto.isActive !== undefined) {
      result.isActive = dto.isActive;
    }
    return result;
  }

  /**
   * ⭐ **Elimina la SCHEDA cliente, non la sua storia.**
   *
   * Deciso dal proprietario il 30/08/2026, e il criterio è quello già in uso per
   * l'unità di misura e il Codice IVA:
   *
   * > _«Quando cancello un'u.m., il dato nei documenti diventa testo e non
   * > sparisce. Tutto quello che è salvato nel gestionale resta — i dati dai
   * > movimenti e dai documenti non spariscono — sparisce solo la scheda
   * > cliente.»_
   *
   * ## Perché si può fare senza perdere niente
   *
   * Il nome del cliente è **già fotografato** su ogni cosa che lo nomina:
   * `Document.customerName`, `SalesOrder.customerName`, `OnlineSale.customerName`,
   * scritti alla creazione da `snapshotCustomerName`. Il riferimento
   * all'anagrafica serve ad aprirne la scheda, non a leggere il nome.
   *
   * ## ⛔ Lo sgancio è ESPLICITO, non un `onDelete` del database
   *
   * Due delle tre relazioni sono `Restrict` (il default di Prisma), quindi il
   * database rifiuterebbe. La strada breve sarebbe cambiare lo schema in
   * `onDelete: SetNull` e migrare — ma quel comportamento diventerebbe
   * **invisibile a chi legge questo servizio**, e su un'operazione che tocca
   * documenti fiscali la cosa che succede va scritta dove si esegue.
   *
   * ⚠️ Tutto in **una transazione**: sganciare e non eliminare lascerebbe
   * documenti orfani di un cliente che esiste ancora.
   *
   * ## La Party sopravvive se serve a un fornitore
   *
   * ⚠️ Cliente e fornitore possono condividere la stessa `Party` — è la stessa
   * azienda in due ruoli. Eliminando il ruolo cliente, l'anagrafica sparisce
   * **solo se nessun fornitore la usa**: toglierla comunque cancellerebbe un
   * fornitore attivo passando dalla porta di servizio.
   */
  async remove(tenantId: string, id: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      select: { id: true, partyId: true },
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Lo storico resta: si toglie il collegamento, non il nome.
      const riferimento = { where: { tenantId, customerId: id }, data: { customerId: null } };
      await tx.document.updateMany(riferimento);
      await tx.salesOrder.updateMany(riferimento);
      await tx.onlineSale.updateMany(riferimento);

      await tx.customer.delete({ where: { id } });

      const anchefornitore = await tx.supplier.findFirst({
        where: { partyId: customer.partyId },
        select: { id: true },
      });
      if (!anchefornitore) {
        await tx.party.delete({ where: { id: customer.partyId } });
      }
    });
  }

  /**
   * ⭐ **Duplica la scheda cliente**: una copia con codice proprio, che si apre
   * per rifinire ciò che deve essere diverso — la stessa forma del duplica
   * prodotto.
   *
   * ⛔ **Partita IVA e codice fiscale NON si copiano** (`partyDuplicateData`): due
   * anagrafiche con la stessa partita IVA non sono una copia, sono un errore.
   *
   * ⚠️ **Non si copia lo storico**, e non è una scelta: documenti, ordini e
   * vendite appartengono al soggetto che li ha fatti. La copia è un soggetto
   * nuovo, e nasce senza passato.
   */
  async duplicate(tenantId: string, id: string): Promise<{ readonly id: string }> {
    const original = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: { party: true },
    });
    if (!original) {
      throw new NotFoundException('Cliente non trovato.');
    }

    return this.prisma.$transaction(async (tx) => {
      const code = await this.allocateNextCustomerCode(tx, tenantId);
      const party = await tx.party.create({
        data: partyDuplicateData(original.party, tenantId),
      });
      const copia = await tx.customer.create({
        data: {
          tenantId,
          partyId: party.id,
          code,
          isActive: original.isActive,
          // Le condizioni commerciali SI copiano: sono il motivo per cui si
          // duplica invece di creare da zero.
          customerDiscount: original.customerDiscount,
          paymentMethod: original.paymentMethod,
          paymentTerms: original.paymentTerms,
          transportResponsible: original.transportResponsible,
          documentCreationAlert: original.documentCreationAlert,
          documentCreationNote: original.documentCreationNote,
          commercialNotes: original.commercialNotes,
          // ⛔ `shopifyCustomerId` NO: quel legame è dell'originale, e il canale
          //    non conosce la copia.
        },
        select: { id: true },
      });
      return copia;
    });
  }
}
