import { describe, expect, it } from 'vitest';

import { buildFatturaPaXml, fatturaPaFileName, type FatturaPaInput } from './fatturapa-xml.util';

function baseInput(overrides: Partial<FatturaPaInput> = {}): FatturaPaInput {
  return {
    documentTypeCode: 'TD01',
    number: 'FT-2026-0001',
    documentDate: new Date('2026-07-21T00:00:00.000Z'),
    currency: 'EUR',
    totalMinor: 12200,
    cedente: {
      legalName: 'Negozio Demo SRL',
      vatNumber: '01234567890',
      fiscalCode: '01234567890',
      address: 'Via Roma 1',
      zip: '20100',
      city: 'Milano',
      province: 'MI',
      countryCode: 'IT',
    },
    cessionario: {
      legalName: 'Cliente SPA',
      vatNumber: '09876543210',
      address: 'Via Verdi 5',
      zip: '00100',
      city: 'Roma',
      province: 'RM',
      countryCode: 'IT',
    },
    sdiCode: 'ABC1234',
    lines: [
      {
        lineNumber: 1,
        description: 'T-shirt Basic',
        quantity: 2,
        unitPriceMinor: 5000,
        discountPercent: 0,
        lineTotalMinor: 10000,
        vatRatePercent: 22,
      },
    ],
    vatSummaries: [{ ratePercent: 22, taxableMinor: 10000, vatMinor: 2200 }],
    ...overrides,
  };
}

describe('buildFatturaPaXml', () => {
  it('produce la struttura FatturaPA con i blocchi obbligatori', () => {
    const xml = buildFatturaPaXml(baseInput());

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('versione="FPR12"');
    expect(xml).toContain('<FatturaElettronicaHeader>');
    expect(xml).toContain('<CedentePrestatore>');
    expect(xml).toContain('<CessionarioCommittente>');
    expect(xml).toContain('<DatiBeniServizi>');
  });

  it('scrive numero, data e totale del documento', () => {
    const xml = buildFatturaPaXml(baseInput());

    expect(xml).toContain('<TipoDocumento>TD01</TipoDocumento>');
    expect(xml).toContain('<Numero>FT-2026-0001</Numero>');
    expect(xml).toContain('<Data>2026-07-21</Data>');
    expect(xml).toContain('<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>');
  });

  it('usa TD04 per la nota di credito', () => {
    const xml = buildFatturaPaXml(baseInput({ documentTypeCode: 'TD04' }));
    expect(xml).toContain('<TipoDocumento>TD04</TipoDocumento>');
  });

  it('converte gli importi da unità minori a due decimali', () => {
    const xml = buildFatturaPaXml(baseInput());

    expect(xml).toContain('<PrezzoUnitario>50.00</PrezzoUnitario>');
    expect(xml).toContain('<PrezzoTotale>100.00</PrezzoTotale>');
    expect(xml).toContain('<ImponibileImporto>100.00</ImponibileImporto>');
    expect(xml).toContain('<Imposta>22.00</Imposta>');
  });

  it('emette un DatiRiepilogo per ogni aliquota', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        vatSummaries: [
          { ratePercent: 22, taxableMinor: 10000, vatMinor: 2200 },
          { ratePercent: 10, taxableMinor: 5000, vatMinor: 500 },
        ],
      }),
    );

    expect(xml.match(/<DatiRiepilogo>/g)).toHaveLength(2);
    expect(xml).toContain('<AliquotaIVA>10.00</AliquotaIVA>');
  });

  // ── Regola centrale: nessun valore inventato ──────────────────────────────

  it('omette i campi che VestiFlow non conosce invece di inventarli', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        cessionario: { legalName: 'Cliente senza dati' },
        paymentDueDate: null,
        iban: null,
      }),
    );

    // Nessun IdFiscaleIVA senza partita IVA.
    expect(xml).not.toContain('<IdCodice></IdCodice>');
    // La Sede del cessionario contiene la sola Nazione (default standard):
    // né indirizzo né CAP né comune inventati.
    const cessionario = xml.slice(
      xml.indexOf('<CessionarioCommittente>'),
      xml.indexOf('</CessionarioCommittente>'),
    );
    expect(cessionario).toContain('<Sede><Nazione>IT</Nazione></Sede>');
    expect(cessionario).not.toContain('<Indirizzo>');
    expect(cessionario).not.toContain('<CAP>');
    // Nessun blocco pagamento senza dati di pagamento reali.
    expect(xml).not.toContain('<DatiPagamento>');
  });

  it('non emette ModalitaPagamento: VestiFlow non gestisce i codici MP01–MP23', () => {
    const xml = buildFatturaPaXml(
      baseInput({ iban: 'IT60X0542811101000000123456', paymentTerms: 'Bonifico 30 gg' }),
    );

    expect(xml).toContain('<DatiPagamento>');
    expect(xml).toContain('<IBAN>IT60X0542811101000000123456</IBAN>');
    expect(xml).not.toContain('<ModalitaPagamento>');
  });

  it('usa il codice destinatario di default previsto dallo standard se assente', () => {
    const xml = buildFatturaPaXml(baseInput({ sdiCode: null }));
    expect(xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
  });

  it('preferisce Nome e Cognome quando manca la ragione sociale', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        cessionario: { firstName: 'Mario', lastName: 'Rossi', fiscalCode: 'RSSMRA80A01H501U' },
      }),
    );

    expect(xml).toContain('<Nome>Mario</Nome>');
    expect(xml).toContain('<Cognome>Rossi</Cognome>');
    expect(xml).not.toContain('<Denominazione>Mario');
  });

  it('scrive la Natura solo con aliquota zero', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        lines: [
          {
            lineNumber: 1,
            description: 'Operazione esente',
            quantity: 1,
            unitPriceMinor: 10000,
            discountPercent: 0,
            lineTotalMinor: 10000,
            vatRatePercent: 0,
            natura: 'N4',
          },
        ],
        vatSummaries: [{ ratePercent: 0, taxableMinor: 10000, vatMinor: 0, natura: 'N4' }],
      }),
    );

    expect(xml).toContain('<Natura>N4</Natura>');
  });

  it('include un blocco DatiDDT per ogni DDT agganciato', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        linkedDdts: [
          { reference: 'DDT-2026-0007', date: new Date('2026-07-15T00:00:00.000Z') },
          { reference: 'DDT-2026-0008', date: new Date('2026-07-16T00:00:00.000Z') },
        ],
      }),
    );

    expect(xml.match(/<DatiDDT>/g)).toHaveLength(2);
    expect(xml).toContain('<NumeroDDT>DDT-2026-0007</NumeroDDT>');
    expect(xml).toContain('<DataDDT>2026-07-16</DataDDT>');
  });

  it('scrive lo sconto riga come ScontoMaggiorazione di tipo SC', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        lines: [
          {
            lineNumber: 1,
            description: 'Articolo scontato',
            quantity: 1,
            unitPriceMinor: 10000,
            discountPercent: 10,
            lineTotalMinor: 9000,
            vatRatePercent: 22,
          },
        ],
      }),
    );

    expect(xml).toContain('<Tipo>SC</Tipo>');
    expect(xml).toContain('<Percentuale>10.00</Percentuale>');
  });

  it("esegue l'escape dei caratteri speciali XML", () => {
    const xml = buildFatturaPaXml(
      baseInput({ cessionario: { legalName: 'Rossi & Bianchi <SRL>' } }),
    );

    expect(xml).toContain('Rossi &amp; Bianchi &lt;SRL&gt;');
    expect(xml).not.toContain('Rossi & Bianchi <SRL>');
  });
});

describe('fatturaPaFileName', () => {
  it('usa la convenzione SDI IT{PIVA}_{numero}', () => {
    expect(fatturaPaFileName('01234567890', 'FT-2026-0001')).toBe('IT01234567890_FT20260001.xml');
  });

  it('ripiega sul solo numero se la partita IVA manca', () => {
    expect(fatturaPaFileName(null, 'FT-2026-0001')).toBe('FT20260001.xml');
  });
});
