import { Injectable } from '@angular/core';

import {
  buildEpsonFiscalReceiptXml,
  epsonFiscalServiceUrl,
  parseEpsonResponse,
  wrapEpsonSoapEnvelope,
} from '../models/epson-fiscal-xml.util';
import type { FiscalPrintOutcome, FiscalPrintPayload } from '../models/fiscal-print.model';

const PRINT_TIMEOUT_MS = 12000;

/**
 * Driver Epson Fiscal ePOS-Print: parla con la stampante RT nella LAN del
 * negozio DAL BROWSER — il server non la raggiunge. Si usa `fetch` puro,
 * non HttpClient: verso la stampante non devono viaggiare né l'Authorization
 * dell'app né gli interceptor d'errore del backend.
 *
 * Prerequisito di rete (POC sul dispositivo reale): HTTPS abilitato sulla
 * stampante e certificato accettato una volta dalla postazione, altrimenti il
 * browser blocca la chiamata come mixed content.
 */
@Injectable({ providedIn: 'root' })
export class EpsonFiscalPrinterService {
  async print(payload: FiscalPrintPayload): Promise<FiscalPrintOutcome> {
    const xml = wrapEpsonSoapEnvelope(buildEpsonFiscalReceiptXml(payload));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS);

    try {
      const response = await fetch(epsonFiscalServiceUrl(payload.endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: xml,
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          errorMessage: `Stampante raggiunta ma risposta HTTP ${response.status}.`,
        };
      }
      const parsed = parseEpsonResponse(await response.text());
      if (!parsed.success) {
        return {
          ok: false,
          errorMessage: `La stampante ha rifiutato il documento${parsed.code ? ` (${parsed.code})` : ''}.`,
        };
      }
      return {
        ok: true,
        fiscalNumber: parsed.fiscalNumber ?? undefined,
        serialNumber: parsed.serialNumber ?? undefined,
      };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      return {
        ok: false,
        errorMessage: aborted
          ? 'Stampante non raggiungibile (timeout).'
          : 'Stampante non raggiungibile: verifica rete e certificato HTTPS.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
