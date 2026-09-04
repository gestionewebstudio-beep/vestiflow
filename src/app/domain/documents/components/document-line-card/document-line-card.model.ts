import type { FormGroup } from '@angular/forms';

import type { DocumentLineRowView } from '../document-line-row/document-line-row.model';

/**
 * Una voce della riga meta della card: codice, SKU, disponibilità.
 *
 * È **dato, non markup**: la card la disegna sempre allo stesso modo (separatore
 * a punto medio, ellissi sul troppo lungo), la maschera dice cosa scriverci.
 * Sono le tre informazioni che devono restare leggibili a card chiusa, e quali
 * siano dipende dal documento.
 */
export interface DocumentLineCardMeta {
  readonly text: string;
  /**
   * In coda, staccata dalle altre sul lato opposto: è il posto della
   * disponibilità, che si legge in colpo d'occhio senza cercarla in mezzo.
   */
  readonly trailing?: boolean;
  /** `warning` per il valore che chiede attenzione — la scorta che non basta. */
  readonly tone?: 'default' | 'warning';
}

/**
 * Le informazioni che restano leggibili a **card chiusa**, calcolate una volta
 * sola per tutti i documenti.
 *
 * ⛔ Qui c'era un vuoto e sei maschere lo riempivano ognuna a modo suo — o non
 * lo riempivano affatto. Sono sempre le stesse tre: da dove riconosci
 * l'articolo (codice), come lo ritrovi (SKU), e quanto ce n'è.
 *
 * ⚠️ Lo SKU arriva come argomento invece di essere letto dalla vista: vive in un
 * `FormControl`, che il template rilegge a ogni giro mentre un valore
 * memorizzato no.
 */
export function documentLineCardMeta(
  view: DocumentLineRowView,
  sku: string,
): readonly DocumentLineCardMeta[] {
  const voci: DocumentLineCardMeta[] = [
    { text: view.linkedArticleCode ? `Cod. ${view.linkedArticleCode}` : 'Nessun codice' },
  ];
  if (sku) {
    voci.push({ text: `SKU ${sku}` });
  }
  // La disponibilità solo dove il documento la conosce: un preventivo non la
  // mostra, e una voce «Disp. » vuota direbbe che è zero.
  if (view.stockAvailable) {
    voci.push({
      text: `Disp. ${view.stockAvailable}`,
      trailing: true,
      tone: view.exceedsAvailability ? 'warning' : 'default',
    });
  }
  return voci;
}

/**
 * Tutto quello che la TESTATA della card mostra, calcolato in un posto solo.
 *
 * ⛔ Sei maschere lo calcolavano ognuna a modo suo, e tre non passavano
 * `complete` affatto: una riga senza articolo si vestiva come una completa,
 * pur avendo il dato già pronto nella maschera.
 *
 * ⚠️ Legge il `FormGroup` invece della vista per nome e variante: sono
 * `FormControl`, che il template rilegge a ogni giro mentre un valore
 * memorizzato no.
 */
export interface DocumentLineCardHead {
  readonly title: string;
  readonly variantLabel: string;
  readonly meta: readonly DocumentLineCardMeta[];
  readonly alert: string;
  readonly complete: boolean;
}

export function documentLineCardHead(
  view: DocumentLineRowView,
  group: FormGroup,
): DocumentLineCardHead {
  const valore = (name: string): string => String(group.get(name)?.value ?? '');
  return {
    title: valore('productName'),
    variantLabel: valore('variantLabel'),
    meta: documentLineCardMeta(view, valore('sku')),
    alert: view.availabilityHint ?? '',
    complete: view.complete,
  };
}
