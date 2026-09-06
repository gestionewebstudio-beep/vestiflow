import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  PaymentMethodCode,
  PaymentOption,
  PaymentOptionKind,
  PaymentTenderKind,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_OPTION_SEED,
  SDI_PAYMENT_METHOD_NAMES,
  SDI_PAYMENT_METHODS,
} from './payment-option-seed.data';

/**
 * Voci pagamento del tenant (logica Danea): modalità e condizioni sono due
 * elenchi separati, preimpostati al primo accesso e gestibili dalle
 * Impostazioni. Le anagrafiche salvano il NOME della voce (snapshot):
 * rinominare o eliminare una voce non riscrive i ruoli già salvati.
 */
@Injectable()
export class PaymentOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, kind?: PaymentOptionKind): Promise<PaymentOption[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.paymentOption.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, kind: PaymentOptionKind, name: string): Promise<PaymentOption> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Il nome della voce è obbligatorio.');
    }
    await this.assertNameAvailable(tenantId, kind, trimmed);

    const last = await this.prisma.paymentOption.aggregate({
      where: { tenantId, kind },
      _max: { sortOrder: true },
    });

    return this.prisma.paymentOption.create({
      data: {
        tenantId,
        kind,
        name: trimmed,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
  }

  /**
   * Il catalogo GLOBALE delle Modalità normative FatturaPA (MP01–MP23).
   *
   * ⚠️ Non è tenant-scoped e non si filtra per tenant: è uno standard, uguale
   * per tutti. Le voci disattivate restano fuori dall'elenco proposto, ma i
   * Tipi che le referenziano continuano a puntarci (FK `RESTRICT`).
   */
  listMethodCodes(): Promise<PaymentMethodCode[]> {
    return this.prisma.paymentMethodCode.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      isActive?: boolean;
      sortOrder?: number;
      methodCodeId?: string | null;
      tenderKind?: PaymentTenderKind | null;
    },
  ): Promise<PaymentOption> {
    const current = await this.getById(tenantId, id);

    let name: string | undefined;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) {
        throw new UnprocessableEntityException('Il nome della voce è obbligatorio.');
      }
      if (name.toLowerCase() !== current.name.toLowerCase()) {
        await this.assertNameAvailable(tenantId, current.kind, name);
      }
    }

    if (input.methodCodeId !== undefined) {
      await this.assertMethodCodeAssignable(current, input.methodCodeId);
    }

    if (input.tenderKind !== undefined) {
      this.assertTenderKindAssignable(current, input.tenderKind);
    }

    return this.prisma.paymentOption.update({
      where: { id: current.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.methodCodeId !== undefined ? { methodCodeId: input.methodCodeId } : {}),
        ...(input.tenderKind !== undefined ? { tenderKind: input.tenderKind } : {}),
      },
    });
  }

  /**
   * La classificazione di incasso vale solo per un Tipo di pagamento: una
   * condizione non si incassa al banco.
   *
   * ⚠️ Come per la Modalità normativa, il controllo esiste ANCHE nel database
   * (`CHECK` in `20260904170000`). Qui serve a dare un messaggio invece di un
   * errore di vincolo, non a sostituirlo.
   */
  private assertTenderKindAssignable(
    option: PaymentOption,
    tenderKind: PaymentTenderKind | null,
  ): void {
    if (tenderKind === null) {
      return;
    }
    if (option.kind !== 'method') {
      throw new UnprocessableEntityException(
        'Le condizioni di pagamento non si incassano alla Cassa.',
      );
    }
  }

  /**
   * Una Modalità normativa si assegna solo a un Tipo di pagamento, mai a una
   * condizione: «30 gg f.m.» non è un modo di pagare.
   *
   * ⚠️ Il controllo esiste ANCHE nel database (`CHECK` nella migration del
   * 04/09/2026). Qui serve a dare un messaggio invece di un errore di
   * vincolo, non a sostituirlo: la guardia vera è quella che non si può
   * aggirare passando da un'altra strada.
   */
  private async assertMethodCodeAssignable(
    option: PaymentOption,
    methodCodeId: string | null,
  ): Promise<void> {
    if (methodCodeId === null) {
      return;
    }
    if (option.kind !== 'method') {
      throw new UnprocessableEntityException(
        'Le condizioni di pagamento non hanno una modalità normativa.',
      );
    }
    const code = await this.prisma.paymentMethodCode.findUnique({
      where: { id: methodCodeId },
    });
    if (!code) {
      throw new NotFoundException('Modalità di pagamento non trovata');
    }
    // ⚠️ Una modalità ritirata non si propone più, ma i Tipi che la usano da
    // prima continuano a puntarci: il divieto è sulla NUOVA associazione, non
    // sul legame che esiste già. Toglierlo a chi ce l'ha sarebbe riscrivere
    // una scelta fatta quando era valida.
    if (!code.isActive) {
      throw new UnprocessableEntityException('Questa modalità di pagamento non è più disponibile.');
    }
  }

  /**
   * Elimina la voce. Le anagrafiche salvano il nome come stringa, quindi
   * l'eliminazione non tocca i ruoli già configurati: la voce sparisce
   * solo dalle nuove selezioni.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const option = await this.getById(tenantId, id);
    await this.prisma.paymentOption.delete({ where: { id: option.id } });
  }

  private async getById(tenantId: string, id: string): Promise<PaymentOption> {
    const option = await this.prisma.paymentOption.findFirst({
      where: { id, tenantId },
    });
    if (!option) {
      throw new NotFoundException('Voce pagamento non trovata');
    }
    return option;
  }

  private async assertNameAvailable(
    tenantId: string,
    kind: PaymentOptionKind,
    name: string,
  ): Promise<void> {
    const duplicate = await this.prisma.paymentOption.findFirst({
      where: { tenantId, kind, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già una voce con questo nome.');
    }
  }

  private async seedIfEmpty(tenantId: string): Promise<void> {
    const codici = await this.mappaCodiciNormativi();

    const count = await this.prisma.paymentOption.count({ where: { tenantId } });
    if (count > 0) {
      // Top-up idempotente: i tenant già inizializzati ricevono le modalità
      // normative fatturazione elettronica mancanti (MP01–MP23) senza toccare
      // le voci esistenti o rinominate (unique tenantId+kind+name).
      await this.ensureSdiPaymentMethods(tenantId, codici);
      return;
    }
    await this.prisma.paymentOption.createMany({
      data: PAYMENT_OPTION_SEED.map((entry) => ({
        tenantId,
        kind: entry.kind,
        name: entry.name,
        sortOrder: entry.sortOrder,
        isSystem: true,
        // ⛔ Il collegamento si crea INSIEME alla voce. La migration ha
        //    collegato le righe che esistevano quando è stata applicata: un
        //    tenant nato dopo non passa di lì, e senza questa riga nascerebbe
        //    con ventitré voci normative scollegate.
        //
        // ⚠️ Nessun ripiego su `null`: `mappaCodiciNormativi` ha già
        //    verificato che ogni codice dichiarato esista, e senza quella
        //    certezza non si sarebbe arrivati qui. Un `?? null` qui
        //    riaprirebbe la porta alle voci mute che la validazione chiude.
        methodCodeId: entry.methodCode ? codici.get(entry.methodCode)! : null,
        // ⭐ Dalla mappa dichiarata, la stessa della migration: un tenant nato
        //    dopo deve avere la stessa classificazione di uno preesistente.
        //    `undefined` diventa `NULL`, che è lo stato di ventotto voci su
        //    trenta — «non utilizzabile nella Cassa».
        tenderKind: entry.tenderKind ?? null,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Il catalogo globale come mappa `codice → id`, VALIDATA.
   *
   * ⛔ Un catalogo vuoto o parziale FERMA il seed, e non è prudenza mancata:
   * dopo C2A il catalogo è una dipendenza obbligatoria, e se manca anche un
   * solo codice significa che migration e applicazione sono disallineate.
   * Proseguire creerebbe voci scollegate — corrette in apparenza, mute per il
   * mapper fiscale — e il disallineamento resterebbe invisibile finché
   * qualcuno non provasse a emettere un documento commerciale.
   *
   * ⚠️ L'errore arriva PRIMA di qualunque scrittura: nessuna voce del tenant
   * si crea o si completa a metà.
   */
  private async mappaCodiciNormativi(): Promise<Map<string, string>> {
    const codici = await this.prisma.paymentMethodCode.findMany({
      where: { isActive: true },
      select: { id: true, code: true },
    });
    const mappa = new Map(codici.map((c) => [c.code, c.id]));

    const mancanti = SDI_PAYMENT_METHODS.filter((entry) => !mappa.has(entry.code)).map(
      (entry) => entry.code,
    );
    if (mancanti.length > 0) {
      throw new ServiceUnavailableException(
        `Catalogo delle modalità di pagamento incompleto: mancano ${mancanti.join(', ')}. ` +
          'La migration delle modalità normative non è stata applicata a questo database.',
      );
    }
    return mappa;
  }

  private async ensureSdiPaymentMethods(
    tenantId: string,
    codici: Map<string, string>,
  ): Promise<void> {
    const esistenti = await this.prisma.paymentOption.findMany({
      where: { tenantId, kind: 'method', name: { in: [...SDI_PAYMENT_METHOD_NAMES] } },
      select: { id: true, name: true, isSystem: true, methodCodeId: true },
    });

    // ── 1. Le voci normative che mancano del tutto ───────────────────────
    const presenti = new Set(esistenti.map((voce) => voce.name));
    const mancanti = SDI_PAYMENT_METHODS.filter((entry) => !presenti.has(entry.name));
    if (mancanti.length > 0) {
      const last = await this.prisma.paymentOption.aggregate({
        where: { tenantId, kind: 'method' },
        _max: { sortOrder: true },
      });
      const base = last._max.sortOrder ?? 0;
      await this.prisma.paymentOption.createMany({
        data: mancanti.map((entry, index) => ({
          tenantId,
          kind: 'method' as const,
          name: entry.name,
          sortOrder: base + index + 1,
          isSystem: true,
          methodCodeId: codici.get(entry.code)!,
        })),
        skipDuplicates: true,
      });
    }

    // ── 2. Le voci di sistema già presenti ma ancora scollegate ──────────
    //
    // ⛔ Il collegamento si decide sulla COPPIA esatta nome+codice del seed,
    //    mai per somiglianza: una voce rinominata dall'utente non corrisponde
    //    più a nessun nome del seed, e resta scollegata — che è il
    //    comportamento voluto, non un caso limite.
    //
    // ⚠️ `isSystem: true` nel filtro non è ridondante: una voce creata
    //    dall'utente con lo stesso nome è sua, e non si tocca.
    const daCollegare = esistenti.filter((voce) => voce.isSystem && voce.methodCodeId === null);
    for (const voce of daCollegare) {
      const entry = SDI_PAYMENT_METHODS.find((e) => e.name === voce.name);
      const methodCodeId = entry ? codici.get(entry.code) : undefined;
      if (!methodCodeId) {
        continue;
      }
      await this.prisma.paymentOption.update({
        where: { id: voce.id },
        data: { methodCodeId },
      });
    }
  }
}
