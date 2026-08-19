import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Persistenza delle righe di un documento in modifica, **conservandone
 * l'identità**. È una regola TRASVERSALE del dominio documenti, non di un tipo:
 * sta qui perché ogni flusso che salva righe deve applicarla identica.
 *
 * Prima si cancellava tutto e si ricreava (`deleteMany` + `lines: { create }`):
 * le righe rinascevano con id nuovi a ogni salvataggio, e con loro si staccava
 * tutto ciò che a una riga si aggancia — il movimento di magazzino via
 * `sourceLineId` e il seriale via `InventorySerial.documentLineId`, che ha
 * `onDelete: SetNull`. È la causa radice misurata in
 * `docs/09-specifica-movimenti-per-riga.md` §3.
 *
 * Regole, deterministiche e nell'ordine:
 * 1. riga con `id` noto   → **update**, stesso id, posizione aggiornata;
 * 2. riga senza `id`      → **create**, id nuovo dal database;
 * 3. riga non più inviata → **delete** della sola riga sparita;
 * 4. `id` sconosciuto o ripetuto → **422**, mai una creazione silenziosa.
 *
 * Due righe dello stesso articolo restano due entità distinte: **l'identità è
 * la riga, non la variante** — ed è ciò che rende ritrovabile il movimento al
 * salvataggio successivo.
 *
 * ⚠️ **L'unica cosa che cambia fra un tipo documento e l'altro è la FORMA DEI
 * DATI di riga**, e per questo arriva come parametro (`toData`). L'algoritmo no:
 * quello è lo stesso per tutti, e averlo in un posto solo è il punto di questo
 * file.
 */
export async function persistDocumentLinesByIdTx<TLine extends { readonly id?: string | null }>(
  tx: Prisma.TransactionClient,
  params: {
    readonly tenantId: string;
    readonly documentId: string;
    /** Id delle righe attualmente sul documento, letti nella stessa transazione. */
    readonly existingLineIds: readonly string[];
    readonly lines: readonly TLine[];
    /** Colonne da scrivere per quella riga: è la sola parte specifica del tipo. */
    readonly toData: (line: TLine) => Record<string, unknown>;
  },
): Promise<void> {
  const { tenantId, documentId, lines } = params;
  const existing = new Set(params.existingLineIds);
  const claimed = new Set<string>();

  // ── Validazione di appartenenza, prima di scrivere qualunque cosa ──
  // `existingLineIds` viene dal documento già letto per tenant: un id che non
  // sta lì o non è di questo documento, o è di un altro tenant, o è già stato
  // eliminato da qualcun altro. In tutti e tre i casi non si tira a indovinare.
  for (const line of lines) {
    if (line.id == null) {
      continue;
    }
    if (!existing.has(line.id)) {
      throw new UnprocessableEntityException(
        'Una riga fa riferimento a un identificativo che non appartiene a questo documento. Ricarica il documento e riprova.',
      );
    }
    if (claimed.has(line.id)) {
      throw new UnprocessableEntityException(
        'La stessa riga è stata inviata due volte nello stesso salvataggio.',
      );
    }
    claimed.add(line.id);
  }

  // ── 3. Le righe sparite dal documento ──
  const removedIds = params.existingLineIds.filter((lineId) => !claimed.has(lineId));
  if (removedIds.length > 0) {
    await tx.documentLine.deleteMany({
      where: { documentId, tenantId, id: { in: removedIds } },
    });
  }

  // ── 1 e 2. Aggiornamento in posto, oppure creazione ──
  for (const line of lines) {
    const data = params.toData(line);
    if (line.id == null) {
      await tx.documentLine.create({
        data: { ...data, tenantId, documentId } as Prisma.DocumentLineUncheckedCreateInput,
      });
      continue;
    }
    // `updateMany` e non `update`: il `where` porta anche documento e tenant,
    // quindi l'appartenenza è imposta dal database e non solo dal controllo
    // qui sopra. Se la riga è sparita sotto i piedi (modifica concorrente) il
    // conteggio è zero e la transazione si ferma, invece di scrivere altrove.
    const { count } = await tx.documentLine.updateMany({
      where: { id: line.id, documentId, tenantId },
      data: data as Prisma.DocumentLineUncheckedUpdateManyInput,
    });
    if (count === 0) {
      throw new ConflictException(
        'Una riga di questo documento è stata modificata o eliminata da un altro salvataggio. Ricarica il documento e riprova.',
      );
    }
  }
}
