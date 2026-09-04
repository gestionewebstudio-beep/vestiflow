import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_HEADER_FIELDS,
  showsHeaderField,
  type CustomerDocumentKind,
  type CustomerHeaderField,
} from './customer-document-header-fields.util';

/**
 * ⭐ **La tabella dice il vero, e resta esaustiva.**
 *
 * ⚠️ Il valore di questa dichiarazione sta nell'essere **completa**: aggiungere
 * un tipo di documento senza dichiarare cosa mostra non deve compilare. Il
 * compilatore lo garantisce sul `Record`; qui si prova che nessuna riga sia
 * stata svuotata per sbaglio, e che il contenuto sia quello misurato.
 */
describe('CUSTOMER_HEADER_FIELDS', () => {
  const TIPI: readonly CustomerDocumentKind[] = [
    'order',
    'quote',
    'ddt-vendita',
    'vendita-manuale',
  ];

  it('⭐ dichiara ogni tipo di documento cliente, senza buchi', () => {
    for (const tipo of TIPI) {
      expect(CUSTOMER_HEADER_FIELDS[tipo], tipo).toBeDefined();
    }
    expect(Object.keys(CUSTOMER_HEADER_FIELDS).sort()).toEqual([...TIPI].sort());
  });

  it('⭐ fotografa quello che il template mostrava il 26/08/2026', () => {
    // ⛔ Non è una proposta: è com'era. Cambiarla è una decisione, e va fatta
    // qui — non sparpagliando `@if` nel template.
    expect(CUSTOMER_HEADER_FIELDS).toEqual({
      order: ['state', 'paymentTerms'],
      quote: ['expectedDelivery', 'paymentTerms'],
      'ddt-vendita': ['paymentMethod', 'followedBySalesDoc'],
      'vendita-manuale': ['externalRef'],
    });
  });

  it('⭐ il «Rif.» è della sola Vendita manuale', () => {
    expect(showsHeaderField('vendita-manuale', 'externalRef')).toBe(true);
    for (const tipo of ['order', 'quote', 'ddt-vendita'] as const) {
      expect(showsHeaderField(tipo, 'externalRef'), tipo).toBe(false);
    }
  });

  it('⭐ i due pagamenti non convivono mai sullo stesso documento', () => {
    // ⚠️ Sono due cose diverse: `paymentTerms` è testo libero («30 gg d.f.»),
    // `paymentMethod` è la voce normativa della fatturazione elettronica.
    // Mostrarli insieme darebbe due campi «Pagamento» nella stessa testata.
    for (const tipo of TIPI) {
      const entrambi =
        showsHeaderField(tipo, 'paymentTerms') && showsHeaderField(tipo, 'paymentMethod');
      expect(entrambi, tipo).toBe(false);
    }
  });

  it('⛔ e nessun campo dichiarato è sconosciuto', () => {
    const noti: readonly CustomerHeaderField[] = [
      'state',
      'expectedDelivery',
      'externalRef',
      'paymentTerms',
      'paymentMethod',
      'followedBySalesDoc',
    ];
    for (const tipo of TIPI) {
      for (const campo of CUSTOMER_HEADER_FIELDS[tipo]) {
        expect(noti, `${tipo} → ${campo}`).toContain(campo);
      }
    }
  });
});
