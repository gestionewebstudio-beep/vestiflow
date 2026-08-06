import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import { italianVatValidator, optionalEmailValidator } from './admin-tenant.validators';

describe('admin-tenant.validators', () => {
  describe('italianVatValidator', () => {
    const validator = italianVatValidator();

    it('accetta valore vuoto (opzionale)', () => {
      expect(validator(new FormControl(''))).toBeNull();
      expect(validator(new FormControl(null))).toBeNull();
    });

    it('accetta P.IVA a 11 cifre', () => {
      expect(validator(new FormControl('12345678901'))).toBeNull();
    });

    it('rifiuta P.IVA non valida', () => {
      expect(validator(new FormControl('123'))).toEqual({ italianVat: true });
      expect(validator(new FormControl('1234567890A'))).toEqual({ italianVat: true });
    });
  });

  describe('optionalEmailValidator', () => {
    const validator = optionalEmailValidator();

    it('accetta valore vuoto', () => {
      expect(validator(new FormControl(''))).toBeNull();
    });

    it('accetta email valida', () => {
      expect(validator(new FormControl('owner@negozio.it'))).toBeNull();
    });

    it('rifiuta email malformata', () => {
      expect(validator(new FormControl('not-an-email'))).toEqual({ email: true });
    });
  });
});
