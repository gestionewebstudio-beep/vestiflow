import { formatVatRate, type VatCode } from '@core/models/vat-code.model';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

/**
 * Opzioni del menu Codice IVA nelle righe documento: identiche per acquisto e
 * vendita, cambia solo l'insieme di codici attivi che il form passa in
 * ingresso. Prima erano due copie, una per form.
 */

/**
 * Voce del dropdown IVA: codice come etichetta, aliquota e descrizione come
 * dettaglio su una riga. L'aliquota non si ripete se già contenuta nella
 * descrizione. La natura resta fuori: vive nel tooltip di cella.
 */
export function vatCodeSelectOption(vatCode: VatCode): SelectMenuOption {
  const rate = formatVatRate(vatCode.ratePercent);
  const description = vatCode.description.trim();
  const detail = description.toLowerCase().includes(rate.toLowerCase())
    ? description
    : `${rate} · ${description}`;
  return { value: vatCode.id, label: vatCode.code, detail };
}

/**
 * Opzioni per una riga: i codici attivi più, se serve, quello già selezionato
 * sulla riga anche se nel frattempo è stato disattivato. Senza, riaprendo un
 * documento storico la cella IVA risulterebbe vuota.
 */
export function vatOptionsIncludingSelected(
  activeOptions: readonly SelectMenuOption[],
  selectedId: string | null | undefined,
  vatCodeById: ReadonlyMap<string, VatCode>,
): readonly SelectMenuOption[] {
  if (!selectedId || activeOptions.some((option) => option.value === selectedId)) {
    return activeOptions;
  }
  const selected = vatCodeById.get(selectedId);
  return selected ? [...activeOptions, vatCodeSelectOption(selected)] : activeOptions;
}
