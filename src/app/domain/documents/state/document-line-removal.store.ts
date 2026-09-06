import { computed, signal } from '@angular/core';
import type { FormGroup } from '@angular/forms';

/**
 * I campi che dicono se una riga ha davvero qualcosa dentro.
 *
 * ⚠️ **La quantità non è fra questi, ed è voluto.** Una riga nasce con quantità
 * 1: contarla come contenuto vorrebbe dire che nessuna riga è mai vuota, e la
 * conferma scatterebbe sempre — cioè non direbbe più niente.
 */
const CAMPI_IDENTITA = [
  'variantId',
  'productName',
  'sku',
  'barcode',
  'supplierSku',
  'articleCode',
  'description',
] as const;

/** I valori economici digitati: una riga con un prezzo scritto NON è vuota. */
const CAMPI_VALORE = ['unitPrice', 'unitCost', 'discount', 'lotCode', 'serialNumbersText'] as const;

/**
 * **Una riga è davvero vuota?**
 *
 * Vuota significa due cose insieme: non è mai stata salvata (`id` assente) e
 * non ha nulla dentro. Basta una delle due a renderla non-vuota — una riga
 * persistita che si è appena svuotata a mano resta un'eliminazione vera, perché
 * al salvataggio sparirà dal documento.
 */
export function documentLineIsEmpty(group: FormGroup): boolean {
  const testo = (name: string): string => String(group.get(name)?.value ?? '').trim();
  if (testo('id')) {
    return false;
  }
  return ![...CAMPI_IDENTITA, ...CAMPI_VALORE].some((name) => testo(name).length > 0);
}

/**
 * **Eliminare una riga: quando si chiede e quando no.**
 *
 * ⛔ Difetto misurato il 24/08/2026 su sei maschere. In cinque il cestino in
 * testata alla card **cancellava al primo tocco**, senza chiedere; nella sesta —
 * la Vendita al banco — non faceva **niente**: era disegnato, abilitato, e
 * l'evento non era nemmeno dichiarato. L'unica conferma di tutta l'app era
 * quella dell'Ordine cliente, ed era scritta dentro la maschera.
 *
 * ⭐ **La regola è una, e non dipende dal documento:**
 *
 * | La riga…                          | Cosa succede             |
 * | --------------------------------- | ------------------------ |
 * | è nuova e davvero vuota           | via subito, niente da perdere |
 * | ha contenuto, o è già persistita  | conferma                 |
 *
 * Chiedere su una riga vuota è rumore: l'operatore preme «Elimina», gli si
 * chiede se è sicuro di cancellare il nulla, e impara a premere «Sì» senza
 * leggere — che è esattamente il modo in cui una conferma smette di proteggere.
 *
 * ⚠️ Il testo della conferma **nomina la riga**: «Maglietta cotone, taglia M»,
 * non «questa riga». Su un documento da venti righe, una conferma che non dice
 * quale si sta eliminando non è verificabile.
 */
export class DocumentLineRemovalStore {
  private readonly inAttesa = signal<number | null>(null);
  private readonly nome = signal('');

  readonly confirmOpen = computed(() => this.inAttesa() !== null);

  readonly message = computed(() => {
    const nome = this.nome();
    return nome
      ? `«${nome}» verrà tolta dal documento. L'eliminazione è definitiva al salvataggio.`
      : `La riga verrà tolta dal documento. L'eliminazione è definitiva al salvataggio.`;
  });

  /**
   * Chiede di eliminare la riga.
   *
   * Ritorna `true` se si può eliminare **subito** — la riga è vuota e non c'è
   * niente da confermare; `false` se la conferma è stata aperta e la maschera
   * deve aspettare.
   */
  request(index: number, group: FormGroup): boolean {
    if (documentLineIsEmpty(group)) {
      return true;
    }
    const nome = String(group.get('productName')?.value ?? '').trim();
    const variante = String(group.get('variantLabel')?.value ?? '').trim();
    this.nome.set([nome, variante].filter(Boolean).join(', '));
    this.inAttesa.set(index);
    return false;
  }

  /** Confermata: l'indice da eliminare, o `null` se non c'era nulla in attesa. */
  confirm(): number | null {
    const index = this.inAttesa();
    this.inAttesa.set(null);
    return index;
  }

  dismiss(): void {
    this.inAttesa.set(null);
  }
}
