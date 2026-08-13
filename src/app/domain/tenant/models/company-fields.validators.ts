import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Partita IVA italiana: opzionale, se valorizzata deve avere 11 cifre. */
export function italianVatValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) {
      return null;
    }
    return /^\d{11}$/.test(value) ? null : { italianVat: true };
  };
}

export function optionalEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) {
      return null;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : { email: true };
  };
}
