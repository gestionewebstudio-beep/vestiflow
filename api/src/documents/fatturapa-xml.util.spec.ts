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

  it('omette DatiPagamento quando la modalità MP01–MP23 non è nota', () => {
    // ModalitaPagamento è obbligatoria dallo schema dentro DettaglioPagamento:
    // senza codice, meglio nessun blocco che un blocco non conforme.
    const xml = buildFatturaPaXml(
      baseInput({ iban: 'IT60X0542811101000000123456', paymentTerms: 'Bonifico 30 gg' }),
    );

    expect(xml).not.toContain('<DatiPagamento>');
  });

  it('emette DatiPagamento TP02 con la modalità normativa quando è nota', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        iban: 'IT60X0542811101000000123456',
        paymentMethodCode: 'MP05',
        paymentDueDate: new Date('2026-08-20T00:00:00.000Z'),
      }),
    );

    expect(xml).toContain('<CondizioniPagamento>TP02</CondizioniPagamento>');
    expect(xml).toContain('<ModalitaPagamento>MP05</ModalitaPagamento>');
    expect(xml).toContain('<DataScadenzaPagamento>2026-08-20</DataScadenzaPagamento>');
    expect(xml).toContain('<ImportoPagamento>122.00</ImportoPagamento>');
    expect(xml).toContain('<IBAN>IT60X0542811101000000123456</IBAN>');
  });

  it('con le rate emette TP01 e un DettaglioPagamento per rata', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        paymentMethodCode: 'MP05',
        installments: [
          { dueDate: new Date('2026-08-31T00:00:00.000Z'), amountMinor: 6100 },
          { dueDate: new Date('2026-09-30T00:00:00.000Z'), amountMinor: 6100 },
        ],
      }),
    );

    expect(xml).toContain('<CondizioniPagamento>TP01</CondizioniPagamento>');
    expect(xml.match(/<DettaglioPagamento>/g)).toHaveLength(2);
    expect(xml).toContain('<DataScadenzaPagamento>2026-09-30</DataScadenzaPagamento>');
    expect(xml.match(/<ImportoPagamento>61\.00<\/ImportoPagamento>/g)).toHaveLength(2);
  });

  it('usa il codice destinatario di default previsto dallo standard se assente', () => {
    const xml = buildFatturaPaXml(baseInput({ sdiCode: null }));
    expect(xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
  });

  it('emette PECDestinatario solo con codice destinatario 0000000 (controllo 00426)', () => {
    const conCodice = buildFatturaPaXml(
      baseInput({ sdiCode: 'ABC1234', pec: 'cliente@pec.it' }),
    );
    const senzaCodice = buildFatturaPaXml(baseInput({ sdiCode: null, pec: 'cliente@pec.it' }));

    expect(conCodice).not.toContain('<PECDestinatario>');
    expect(senzaCodice).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>');
    expect(senzaCodice).toContain('<PECDestinatario>cliente@pec.it</PECDestinatario>');
  });

  it('tronca il ProgressivoInvio a 10 alfanumerici (String10Type)', () => {
    const xml = buildFatturaPaXml(baseInput({ number: 'FT-2026-A-00042' }));

    // «FT2026A00042» ha 12 caratteri: restano gli ultimi 10.
    expect(xml).toContain('<ProgressivoInvio>2026A00042</ProgressivoInvio>');
    // Il Numero del documento resta però integrale.
    expect(xml).toContain('<Numero>FT-2026-A-00042</Numero>');
  });

  it('emette PrezzoUnitario con la coda decimale del netto esatto (controllo 00423)', () => {
    // 25,00 € ivato al 22% → netto esatto 20,491803… minor: la coda deve
    // uscire, o il ricalcolo SDI prezzo × quantità non torna col PrezzoTotale.
    const xml = buildFatturaPaXml(
      baseInput({
        lines: [
          {
            lineNumber: 1,
            description: 'Prezzo con coda',
            quantity: 30,
            unitPriceMinor: 2049.180328,
            discountPercent: 0,
            lineTotalMinor: 61475,
            vatRatePercent: 22,
          },
        ],
      }),
    );

    expect(xml).toContain('<PrezzoUnitario>20.49180328</PrezzoUnitario>');
  });

  it('con una sola rata dichiara comunque TP01: un acconto non è un pagamento completo', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        paymentMethodCode: 'MP05',
        installments: [{ dueDate: new Date('2026-08-31T00:00:00.000Z'), amountMinor: 6100 }],
      }),
    );

    expect(xml).toContain('<CondizioniPagamento>TP01</CondizioniPagamento>');
    expect(xml).toContain('<ImportoPagamento>61.00</ImportoPagamento>');
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

  it('scrive lo sconto testata ripartito come secondo ScontoMaggiorazione', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        lines: [
          {
            lineNumber: 1,
            description: 'Articolo con doppio sconto',
            quantity: 1,
            unitPriceMinor: 10000,
            discountPercent: 10,
            extraDiscountPercent: 5,
            lineTotalMinor: 8550,
            vatRatePercent: 22,
          },
        ],
      }),
    );

    expect(xml.match(/<ScontoMaggiorazione>/g)).toHaveLength(2);
    expect(xml).toContain('<Percentuale>5.00</Percentuale>');
    expect(xml).toContain('<PrezzoTotale>85.50</PrezzoTotale>');
  });

  it('scrive il regime fiscale del cedente, con RF01 come ripiego', () => {
    const rf19 = buildFatturaPaXml(
      baseInput({ cedente: { legalName: 'Forfettario SRLS', taxRegime: 'RF19' } }),
    );
    const fallback = buildFatturaPaXml(baseInput());

    expect(rf19).toContain('<RegimeFiscale>RF19</RegimeFiscale>');
    expect(fallback).toContain('<RegimeFiscale>RF01</RegimeFiscale>');
  });

  it('include DatiFattureCollegate per la fattura rettificata dalla nota di credito', () => {
    const xml = buildFatturaPaXml(
      baseInput({
        documentTypeCode: 'TD04',
        linkedInvoices: [
          { reference: 'FT-2026-0001', date: new Date('2026-07-21T00:00:00.000Z') },
        ],
      }),
    );

    expect(xml).toContain(
      '<DatiFattureCollegate><IdDocumento>FT-2026-0001</IdDocumento><Data>2026-07-21</Data></DatiFattureCollegate>',
    );
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
  it('usa la convenzione SDI IT{PIVA}_{progressivo} con progressivo di max 5 caratteri', () => {
    expect(fatturaPaFileName('01234567890', 'FT-2026-0001')).toBe('IT01234567890_60001.xml');
  });

  it('ripiega sul solo progressivo se la partita IVA manca', () => {
    expect(fatturaPaFileName(null, 'FT-2026-0001')).toBe('60001.xml');
  });
});
