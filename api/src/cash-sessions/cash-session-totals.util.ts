import { UnprocessableEntityException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';

/**
 * Gli **addendi della quadratura** di una sessione di cassa (`docs/25` §9).
 *
 * ⭐ **Vive qui e non dentro la chiusura** perché lo usano in due: la chiusura,
 * che li calcola una volta e ne CONGELA due; e il dettaglio di sessione, che li
 * ricostruisce per mostrare da dove viene il numero congelato. Due copie della
 * stessa aritmetica darebbero due risposte diverse alla stessa domanda, ed è la
 * duplicazione che `regole-qualita` chiede di centralizzare al secondo punto.
 *
 * ⛔ **I documenti ANNULLATI non contribuiscono**, e la classe la porta la
 * QUOTA — non il Tipo pagamento corrente. Riclassificare un Tipo domani
 * cambierebbe altrimenti la quadratura di una sessione chiusa a marzo.
 */
export interface AttesiSessione {
  readonly openingFloatMinor: number;
  readonly salesCashMinor: number;
  readonly returnsCashMinor: number;
  readonly salesElectronicMinor: number;
  readonly returnsElectronicMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
  readonly expectedCashMinor: number;
  readonly expectedElectronicMinor: number;
}

/** Il client: la transazione della chiusura, o quello globale in lettura. */
export type CashTotalsDb = Prisma.TransactionClient;

export async function calcolaAttesiSessione(
  db: CashTotalsDb,
  tenantId: string,
  sessione: { readonly id: string; readonly openingFloatMinor: number },
): Promise<AttesiSessione> {
  const quote = await db.storeSalePayment.findMany({
    where: {
      tenantId,
      document: {
        cashSessionId: sessione.id,
        status: { not: DocumentStatus.cancelled },
        type: { in: [DocumentType.store_sale, DocumentType.store_return] },
      },
    },
    select: {
      amountMinor: true,
      tenderKindSnapshot: true,
      optionNameSnapshot: true,
      document: { select: { type: true } },
    },
  });

  let venditeCash = 0;
  let resiCash = 0;
  let venditeElettroniche = 0;
  let resiElettronici = 0;

  for (const q of quote) {
    const vendita = q.document.type === DocumentType.store_sale;
    // ⛔ ESAUSTIVO sull'enum, senza ramo di ripiego: il `bucket()` del ramo
    //    storico mandava «ogni metodo sconosciuto» in `other`, e una classe
    //    nuova sarebbe sparita in silenzio dalla quadratura.
    switch (q.tenderKindSnapshot) {
      case 'cash':
        if (vendita) venditeCash += q.amountMinor;
        else resiCash += q.amountMinor;
        break;
      case 'electronic':
        if (vendita) venditeElettroniche += q.amountMinor;
        else resiElettronici += q.amountMinor;
        break;
      case 'voucher':
        // ⚠️ Modellati in C2B, non abilitati al checkout: se una quota così
        //    esiste, la sessione non si quadra — e lo si DICE, invece di
        //    farla sparire in un ramo di ripiego.
        throw new UnprocessableEntityException(
          `«${q.optionNameSnapshot ?? 'Buono'}»: i buoni non rientrano ancora nella quadratura di cassa.`,
        );
      case null:
        throw new UnprocessableEntityException(
          `«${q.optionNameSnapshot ?? 'Una quota'}» non è classificata: non si può quadrare la cassa.`,
        );
      default:
        // ⚠️ Irraggiungibile finché l'enum è quello di oggi. Esiste perché il
        //    giorno in cui una classe nuova arriva, questo `switch` deve
        //    FERMARSI, non stimare.
        throw new UnprocessableEntityException(
          'Questa sessione contiene una classe di incasso che la chiusura non conosce.',
        );
    }
  }

  const movimenti = await db.cashSessionMovement.groupBy({
    by: ['type'],
    where: { tenantId, sessionId: sessione.id },
    _sum: { amountMinor: true },
  });
  const versamenti = movimenti.find((m) => m.type === 'deposit')?._sum.amountMinor ?? 0;
  const prelievi = movimenti.find((m) => m.type === 'withdrawal')?._sum.amountMinor ?? 0;

  return {
    openingFloatMinor: sessione.openingFloatMinor,
    salesCashMinor: venditeCash,
    returnsCashMinor: resiCash,
    salesElectronicMinor: venditeElettroniche,
    returnsElectronicMinor: resiElettronici,
    depositsMinor: versamenti,
    withdrawalsMinor: prelievi,
    expectedCashMinor: sessione.openingFloatMinor + venditeCash - resiCash + versamenti - prelievi,
    // ⭐ Né fondo né cassetto: il cassetto non c'entra con l'elettronico.
    expectedElectronicMinor: venditeElettroniche - resiElettronici,
  };
}
