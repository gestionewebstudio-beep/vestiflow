import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

import type { PaymentOption } from '@core/models/payment-option.model';
import {
  countryCodeWarning,
  ibanWarning,
  postalCodeWarning,
  provinceWarning,
  taxCodeWarning,
  vatNumberWarning,
} from '@domain/fiscal/fiscal-fields.util';
import { FormSectionComponent } from '@shared/components/form-section/form-section.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { CustomerFormGroup } from '@domain/customers/utils/customer-form.util';

/** I campi che hanno un controllo di digitazione. */
type CampoConAvviso = 'vatNumber' | 'taxCode' | 'iban' | 'postalCode' | 'province' | 'countryCode';

/**
 * ⚠️ **Il tipo è la chiave esatta, non `string`**: con
 * `noUncheckedIndexedAccess` un `Record<string, …>` restituisce
 * `T | undefined`, e la mappa andrebbe interrogata col punto di domanda —
 * cioè un avviso potrebbe sparire senza che nessuno se ne accorga.
 */
const AVVISI: Readonly<Record<CampoConAvviso, (valore: string) => string | null>> = {
  vatNumber: vatNumberWarning,
  taxCode: taxCodeWarning,
  postalCode: postalCodeWarning,
  province: provinceWarning,
  countryCode: countryCodeWarning,
  iban: ibanWarning,
};

@Component({
  selector: 'app-customer-form-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormSectionComponent, SelectMenuComponent],
  templateUrl: './customer-form-fields.component.html',
  styleUrl: './customer-form-fields.component.scss',
})
export class CustomerFormFieldsComponent {
  readonly formGroup = input.required<CustomerFormGroup>();
  readonly idPrefix = input('customer-form');
  readonly anagraficaReadOnly = input(false);
  /** Visibile solo in modifica: in creazione il codice è assegnato automaticamente. */
  readonly showCodeField = input(false);
  /** Voci pagamento del tenant (dal parent smart): modalità e condizioni. */
  readonly paymentOptions = input<readonly PaymentOption[]>([]);

  protected readonly paymentMethodOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('method', this.formGroup().controls.paymentMethod.value),
  );

  protected readonly paymentTermsOptions = computed((): readonly SelectMenuOption[] =>
    this.buildPaymentOptions('terms', this.formGroup().controls.paymentTerms.value),
  );

  /** Un campo mostra il proprio errore solo dopo che l'utente l'ha toccato. */
  protected showError(controlName: keyof CustomerFormGroup['controls']): boolean {
    const control = this.formGroup().controls[controlName];
    return control.invalid && control.touched;
  }

  /**
   * ⭐ **L'avviso di digitazione** — partita IVA, codice fiscale, IBAN, CAP,
   * provincia, paese: gli stessi controlli della scheda fornitore, perché sono
   * campi dello STESSO soggetto anagrafico.
   *
   * ⛔ **Non è un errore e non blocca il salvataggio**: `regole-gestionale`
   * riserva il blocco alle violazioni che romperebbero database, sync o
   * identità (SKU, codice articolo, barcode). Una partita IVA con la cifra di
   * controllo sbagliata è quasi sempre un refuso, ma ogni tanto è il dato che
   * il cliente ha davvero dato — e va potuto salvare.
   *
   * ⚠️ **Compare all'uscita dal campo, non mentre si scrive**: al primo
   * carattere ogni partita IVA è «non valida», e un avviso che lampeggia a
   * ogni tasto si impara a ignorare.
   */
  protected avviso(controlName: CampoConAvviso): string | null {
    const control = this.formGroup().controls[controlName];
    if (!control.touched) {
      return null;
    }
    return AVVISI[controlName](control.value);
  }

  protected onPaymentMethodSelect(value: string | null): void {
    this.formGroup().controls.paymentMethod.setValue(value ?? '');
    this.formGroup().controls.paymentMethod.markAsDirty();
  }

  protected onPaymentTermsSelect(value: string | null): void {
    this.formGroup().controls.paymentTerms.setValue(value ?? '');
    this.formGroup().controls.paymentTerms.markAsDirty();
  }

  /** Voci attive + il valore corrente se non più in elenco (snapshot storico). */
  private buildPaymentOptions(
    kind: PaymentOption['kind'],
    currentValue: string,
  ): readonly SelectMenuOption[] {
    const options = this.paymentOptions()
      .filter((entry) => entry.kind === kind && (entry.isActive || entry.name === currentValue))
      .map((entry) => ({ value: entry.name, label: entry.name }));
    const current = currentValue.trim();
    if (current && !options.some((option) => option.value === current)) {
      return [...options, { value: current, label: `${current} (personalizzato)` }];
    }
    return options;
  }
}
