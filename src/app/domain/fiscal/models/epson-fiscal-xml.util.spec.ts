import { describe, expect, it } from 'vitest';

import type { FiscalPrintPayload } from './fiscal-print.model';
import {
  buildEpsonFiscalReceiptXml,
  epsonFiscalServiceUrl,
  parseEpsonResponse,
  toEpsonAmount,
} from './epson-fiscal-xml.util';

const SALE: FiscalPrintPayload = {
  documentId: 'doc-1',
  documentType: 'sale',
  reference: 'VN-2026-0007',
  endpoint: 'https://192.168.1.50',
  brand: 'epson',
  deviceSerialNumber: 'MAT123',
  lines: [
    { description: 'Maglia cotone M', quantity: 2, unitPriceGrossMinor: 2428, department: 1 },
  ],
  payments: [
    { description: 'CONTANTI', amountMinor: 3000, epsonPaymentType: 0 },
    { description: 'CARTA', amountMinor: 1856, epsonPaymentType: 2 },
  ],
  original: null,
};

describe('epson-fiscal-xml.util', () => {
  it('importi col punto decimale, sempre due cifre', () => {
    expect(toEpsonAmount(2428)).toBe('24.28');
    expect(toEpsonAmount(500)).toBe('5.00');
    expect(toEpsonAmount(9)).toBe('0.09');
    expect(toEpsonAmount(-1990)).toBe('-19.90');
  });

  it('endpoint del servizio fiscale senza doppie slash', () => {
    expect(epsonFiscalServiceUrl('https://192.168.1.50/')).toBe(
      'https://192.168.1.50/cgi-bin/fpmate.cgi?devid=local_printer&timeout=10000',
    );
  });

  it('vendita: printRecItem per riga e printRecTotal per ogni metodo', () => {
    const xml = buildEpsonFiscalReceiptXml(SALE);
    expect(xml).toContain('<beginFiscalReceipt operator="1" />');
    expect(xml).toContain(
      '<printRecItem operator="1" description="Maglia cotone M" quantity="2" unitPrice="24.28" department="1" justification="1" />',
    );
    expect(xml).toContain(
      '<printRecTotal operator="1" description="CONTANTI" payment="30.00" paymentType="0" index="1" justification="2" />',
    );
    expect(xml).toContain(
      '<printRecTotal operator="1" description="CARTA" payment="18.56" paymentType="2" index="2" justification="2" />',
    );
    expect(xml).toContain('message="Rif. VN-2026-0007"');
    expect(xml).toContain('<endFiscalReceipt operator="1" />');
    // Niente righe di reso in una vendita.
    expect(xml).not.toContain('printRecRefund');
  });

  it('reso: preambolo RESO MERCE con gli estremi della ricevuta originale e printRecRefund', () => {
    const xml = buildEpsonFiscalReceiptXml({
      ...SALE,
      documentType: 'return',
      payments: [],
      original: {
        fiscalNumber: '0012-0034',
        issuedAt: '2026-08-06T10:00:00.000Z',
        serialNumber: 'MAT123',
      },
    });
    expect(xml).toContain(
      'messageType="4" message="RESO MERCE N. 0012-0034 del 06-08-2026 RT MAT123"',
    );
    expect(xml).toContain('<printRecRefund operator="1" description="Maglia cotone M"');
    expect(xml).not.toContain('printRecItem ');
    expect(xml).not.toContain('printRecTotal');
  });

  it('descrizioni: XML escapato e troncato alla larghezza della carta', () => {
    const xml = buildEpsonFiscalReceiptXml({
      ...SALE,
      lines: [
        {
          description: 'T-shirt "promo" <estiva> & lunga davvero tanto oltre la carta',
          quantity: 1,
          unitPriceGrossMinor: 1000,
          department: 1,
        },
      ],
    });
    expect(xml).toContain('T-shirt &quot;promo&quot; &lt;estiva&gt; &amp;');
    expect(xml).not.toContain('<estiva>');
  });

  it('vendita a totale zero: un printRecTotal contanti a 0.00 (lo scontrino esce comunque)', () => {
    const xml = buildEpsonFiscalReceiptXml({ ...SALE, payments: [] });
    expect(xml).toContain('payment="0.00" paymentType="0"');
  });

  it('risposta stampante: esito, progressivo zRep-numero e matricola', () => {
    const response = parseEpsonResponse(
      `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="ns"><soapenv:Body>
        <response success="true" code="" status="2">
          <addInfo>
            <elementList>lastCommand,printerStatus,fiscalReceiptNumber,zRepNumber</elementList>
            <lastCommand>74</lastCommand>
            <printerStatus>20110</printerStatus>
            <fiscalReceiptNumber>34</fiscalReceiptNumber>
            <zRepNumber>12</zRepNumber>
            <printerSerialNumber>99MEY123456</printerSerialNumber>
          </addInfo>
        </response>
      </soapenv:Body></soapenv:Envelope>`,
    );
    expect(response.success).toBe(true);
    expect(response.fiscalNumber).toBe('0012-0034');
    expect(response.serialNumber).toBe('99MEY123456');
  });

  it('risposta di errore: success false e codice riportato', () => {
    const response = parseEpsonResponse(
      '<response success="false" code="EPTR_REC_EMPTY" status="0" />',
    );
    expect(response.success).toBe(false);
    expect(response.code).toBe('EPTR_REC_EMPTY');
    expect(response.fiscalNumber).toBeNull();
  });
});
