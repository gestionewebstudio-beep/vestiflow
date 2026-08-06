// Builder del Fiscal ePOS-Print XML per stampanti Epson RT (FP-81II/FP-90III).
// Funzioni pure: il payload arriva già composto dal server, qui si renderizza
// il protocollo. La conferma finale del flusso di reso va validata sul
// dispositivo reale in fase di POC (il preambolo «RESO MERCE» segue la
// convenzione documentata da Epson, ma il firmware ha l'ultima parola).

import type { FiscalPrintPayload } from './fiscal-print.model';

/** Larghezza utile della riga descrizione sulle RT Epson (carta 80mm). */
const MAX_DESCRIPTION_LENGTH = 38;

/** Endpoint del servizio fiscale a bordo stampante. */
export function epsonFiscalServiceUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/cgi-bin/fpmate.cgi?devid=local_printer&timeout=10000`;
}

/** 2428 → "24.28": la stampante vuole il punto decimale, sempre 2 cifre. */
export function toEpsonAmount(amountMinor: number): string {
  const abs = Math.abs(amountMinor);
  return `${amountMinor < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeDescription(value: string): string {
  return escapeXml(value.slice(0, MAX_DESCRIPTION_LENGTH));
}

/** `2026-08-06T…` → `06-08-2026` (formato richiesto dal preambolo di reso). */
function refundDate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

/**
 * Documento commerciale di vendita o di reso nel dialetto Fiscal ePOS-Print.
 * Vendita: `printRecItem` per riga + `printRecTotal` per metodo di pagamento.
 * Reso: preambolo «RESO MERCE» con gli estremi della ricevuta originale
 * (numero zRep-progressivo, data, matricola) + `printRecRefund` per riga.
 */
export function buildEpsonFiscalReceiptXml(payload: FiscalPrintPayload): string {
  const parts: string[] = ['<printerFiscalReceipt>'];

  if (payload.documentType === 'return') {
    const original = payload.original;
    // Il firmware RT riconosce il messageType 4 come preambolo del reso.
    const message = [
      'RESO MERCE',
      original?.fiscalNumber ? `N. ${original.fiscalNumber}` : null,
      original?.issuedAt ? `del ${refundDate(original.issuedAt)}` : null,
      original?.serialNumber ? `RT ${original.serialNumber}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    parts.push(`<printRecMessage operator="1" messageType="4" message="${escapeXml(message)}" />`);
  }

  parts.push('<beginFiscalReceipt operator="1" />');

  const lineTag = payload.documentType === 'return' ? 'printRecRefund' : 'printRecItem';
  for (const line of payload.lines) {
    parts.push(
      `<${lineTag} operator="1" description="${sanitizeDescription(line.description)}" ` +
        `quantity="${line.quantity}" unitPrice="${toEpsonAmount(line.unitPriceGrossMinor)}" ` +
        `department="${line.department}" justification="1" />`,
    );
  }

  if (payload.documentType === 'sale') {
    parts.push('<printRecSubtotal operator="1" option="0" />');
  }

  // Riferimento interno VestiFlow in coda allo scontrino (messageType 3 =
  // testo dopo la parte fiscale): aggancia scontrino e documento.
  if (payload.reference) {
    parts.push(
      `<printRecMessage operator="1" messageType="3" message="${escapeXml(`Rif. ${payload.reference}`)}" />`,
    );
  }

  if (payload.documentType === 'sale') {
    const payments = payload.payments.length
      ? payload.payments
      : [{ description: 'CONTANTI', amountMinor: 0, epsonPaymentType: 0 }];
    payments.forEach((payment, index) => {
      parts.push(
        `<printRecTotal operator="1" description="${sanitizeDescription(payment.description)}" ` +
          `payment="${toEpsonAmount(payment.amountMinor)}" paymentType="${payment.epsonPaymentType}" ` +
          `index="${index + 1}" justification="2" />`,
      );
    });
  }

  parts.push('<endFiscalReceipt operator="1" />');
  parts.push('</printerFiscalReceipt>');
  return parts.join('\n');
}

/** Envelope SOAP richiesto dal servizio ePOS-Print della stampante. */
export function wrapEpsonSoapEnvelope(fiscalXml: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n' +
    '<soapenv:Body>\n' +
    fiscalXml +
    '\n</soapenv:Body>\n' +
    '</soapenv:Envelope>'
  );
}

/** Esito parsato della risposta SOAP della stampante. */
export interface EpsonPrinterResponse {
  readonly success: boolean;
  readonly code: string | null;
  /** Progressivo composto zRep-numero (es. `0012-0034`), se la RT lo riporta. */
  readonly fiscalNumber: string | null;
  readonly serialNumber: string | null;
}

/**
 * La risposta porta `<response success="true|false" code="…">` e, nei campi
 * addInfo, numero scontrino e numero di chiusura (zRep) con cui si compone il
 * progressivo del documento commerciale.
 */
export function parseEpsonResponse(xmlText: string): EpsonPrinterResponse {
  const parsed = new DOMParser().parseFromString(xmlText, 'text/xml');
  const response = parsed.querySelector('response');
  const success = response?.getAttribute('success') === 'true';
  const code = response?.getAttribute('code') || null;

  const info = new Map<string, string>();
  for (const element of Array.from(parsed.querySelectorAll('addInfo > *'))) {
    info.set(element.tagName, element.textContent ?? '');
  }
  const receiptNumber = info.get('fiscalReceiptNumber')?.trim();
  const zRepNumber = info.get('zRepNumber')?.trim();
  const fiscalNumber =
    receiptNumber && zRepNumber
      ? `${zRepNumber.padStart(4, '0')}-${receiptNumber.padStart(4, '0')}`
      : (receiptNumber ?? null);

  return {
    success,
    code,
    fiscalNumber: fiscalNumber || null,
    serialNumber: info.get('printerSerialNumber')?.trim() || null,
  };
}
