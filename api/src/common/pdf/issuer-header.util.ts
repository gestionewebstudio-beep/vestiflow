import { issuerAddressLine, type DocumentIssuer } from '../company/document-issuer.util';
import type { PdfDocumentInstance } from './pdf-document.types';

/**
 * L'intestazione di chi emette, in cima a ogni stampa: documenti, ordine
 * cliente, ordine fornitore. Era ricopiata in tutti e tre i servizi PDF, con
 * differenze non volute — in uno di quelli la partita IVA finiva in grassetto
 * grande quando l'indirizzo mancava, perché ereditava il font del titolo.
 *
 * Restituisce la Y dopo l'intestazione, spaziatura inclusa.
 */
export function drawIssuerHeader(
  doc: PdfDocumentInstance,
  issuer: DocumentIssuer,
  startY: number,
): number {
  const left = doc.page.margins.left;
  let y = startY;

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text(issuer.legalName, left, y);
  y += 14;

  const line = (text: string): void => {
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text(text, left, y);
    y += 12;
  };

  const address = issuerAddressLine(issuer);
  if (address) {
    line(address);
  }

  const fiscalIds = [
    issuer.vatNumber ? `P. IVA: ${issuer.vatNumber}` : null,
    // Il codice fiscale si stampa solo se diverso dalla partita IVA: per le
    // società coincidono, e ripeterlo aggiunge una riga che non dice nulla.
    issuer.fiscalCode && issuer.fiscalCode !== issuer.vatNumber
      ? `C.F.: ${issuer.fiscalCode}`
      : null,
  ].filter((part): part is string => part !== null);
  if (fiscalIds.length > 0) {
    line(fiscalIds.join(' · '));
  }

  const contacts = [
    issuer.phone ? `Tel. ${issuer.phone}` : null,
    issuer.email,
    issuer.pec ? `PEC ${issuer.pec}` : null,
    issuer.website,
  ].filter((part): part is string => Boolean(part));
  if (contacts.length > 0) {
    line(contacts.join(' · '));
  }

  doc.fillColor('#000000');
  return y + 8;
}

/**
 * Il piede con i dati del Registro Imprese: per le società l'art. 2250 c.c. li
 * vuole sugli atti e sulla corrispondenza. Chi non li ha dichiarati non stampa
 * niente — una ditta individuale al registro non è iscritta, e una riga vuota
 * sarebbe peggio dell'assenza.
 *
 * Restituisce la Y finale; identica a quella ricevuta se non c'è nulla da dire.
 */
export function drawIssuerFooter(
  doc: PdfDocumentInstance,
  issuer: DocumentIssuer,
  startY: number,
): number {
  const parts = [
    issuer.reaOffice && issuer.reaNumber
      ? `R.E.A. ${issuer.reaOffice.toUpperCase()} ${issuer.reaNumber}`
      : null,
    typeof issuer.shareCapitalMinor === 'number'
      ? `Cap. soc. € ${(issuer.shareCapitalMinor / 100).toFixed(2)}`
      : null,
    issuer.soleShareholder === true ? 'Socio unico' : null,
    issuer.inLiquidation ? 'Società in liquidazione' : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return startY;
  }

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#666666')
    .text(parts.join(' · '), left, startY, { width });
  doc.fillColor('#000000');
  return startY + 12;
}
