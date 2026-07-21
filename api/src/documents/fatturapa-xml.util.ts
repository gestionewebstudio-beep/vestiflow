/**
 * Generatore XML FatturaPA (formato SDI, versione FPR12).
 *
 * Regola di fondo: si scrivono SOLO i dati che VestiFlow gestisce davvero.
 * I campi che il gestionale non copre restano vuoti o assumono il valore di
 * default previsto dallo standard — mai un valore inventato. Un XML con un
 * campo plausibile ma falso è peggio di uno incompleto: il commercialista può
 * accorgersi di un buco, non di un dato verosimile e sbagliato.
 *
 * L'output non è garantito "pronto da trasmettere": è una base che il
 * commercialista completa. Per questo non applichiamo validazioni SDI.
 */

/** Aliquota IVA con i suoi imponibili, per il blocco DatiRiepilogo. */
export interface FatturaPaVatSummary {
  readonly ratePercent: number;
  readonly taxableMinor: number;
  readonly vatMinor: number;
  /** Natura (N1…N7): obbligatoria dallo standard quando l'aliquota è 0. */
  readonly natura?: string;
}

export interface FatturaPaLine {
  readonly lineNumber: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountPercent: number;
  readonly lineTotalMinor: number;
  readonly vatRatePercent: number;
  readonly natura?: string;
}

/** Anagrafica di una delle due parti (cedente o cessionario). */
export interface FatturaPaParty {
  readonly legalName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly vatNumber?: string | null;
  readonly fiscalCode?: string | null;
  readonly address?: string | null;
  readonly zip?: string | null;
  readonly city?: string | null;
  readonly province?: string | null;
  readonly countryCode?: string | null;
}

export interface FatturaPaInput {
  /** TD01 fattura, TD04 nota di credito. */
  readonly documentTypeCode: 'TD01' | 'TD04';
  readonly number: string;
  /** Data documento, solo giorno. */
  readonly documentDate: Date;
  readonly currency: string;
  readonly totalMinor: number;
  readonly cedente: FatturaPaParty;
  readonly cessionario: FatturaPaParty;
  /** Codice destinatario SDI del cessionario; default standard se assente. */
  readonly sdiCode?: string | null;
  readonly pec?: string | null;
  readonly lines: readonly FatturaPaLine[];
  readonly vatSummaries: readonly FatturaPaVatSummary[];
  readonly paymentTerms?: string | null;
  readonly paymentDueDate?: Date | null;
  readonly iban?: string | null;
  /** Riferimenti DDT agganciati (blocco DatiDDT). */
  readonly linkedDdts?: readonly { readonly reference: string; readonly date: Date }[];
  readonly notes?: string | null;
}

/**
 * Codice destinatario di default previsto dallo standard quando non è noto:
 * sette zeri. Non è un placeholder inventato — è il valore che lo standard
 * impone per i casi in cui la trasmissione avviene per altra via (es. PEC).
 */
const DEFAULT_SDI_CODE = '0000000';

/** Regime fiscale: VestiFlow non lo gestisce, RF01 è il default ordinario. */
const DEFAULT_TAX_REGIME = 'RF01';

/** Nazione di default quando l'anagrafica non la specifica. */
const DEFAULT_COUNTRY = 'IT';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Importi FatturaPA: sempre due decimali, punto come separatore. */
function money(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/** Percentuali FatturaPA: due decimali. */
function rate(percent: number): string {
  return percent.toFixed(2);
}

/** Date FatturaPA: YYYY-MM-DD, senza orario né fuso. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tag scritto solo se il valore c'è: mai un elemento vuoto per riempire. */
function tag(name: string, value: string | null | undefined): string {
  const trimmed = value?.toString().trim();
  return trimmed ? `<${name}>${escapeXml(trimmed)}</${name}>` : '';
}

/**
 * Denominazione o Nome+Cognome: lo standard vuole l'una o l'altra coppia,
 * mai entrambe. Le persone fisiche senza ragione sociale usano Nome/Cognome.
 */
function anagraficaBlock(party: FatturaPaParty): string {
  const legal = party.legalName?.trim();
  if (legal) {
    return `<Anagrafica>${tag('Denominazione', legal)}</Anagrafica>`;
  }
  const nome = party.firstName?.trim();
  const cognome = party.lastName?.trim();
  if (nome || cognome) {
    return `<Anagrafica>${tag('Nome', nome)}${tag('Cognome', cognome)}</Anagrafica>`;
  }
  // Nessun nominativo disponibile: si lascia il blocco vuoto anziché
  // inventare una denominazione.
  return '<Anagrafica></Anagrafica>';
}

/** IdFiscaleIVA: presente solo se la partita IVA c'è davvero. */
function idFiscaleIvaBlock(party: FatturaPaParty): string {
  const vat = party.vatNumber?.trim();
  if (!vat) {
    return '';
  }
  const country = party.countryCode?.trim() || DEFAULT_COUNTRY;
  return `<IdFiscaleIVA>${tag('IdPaese', country)}${tag('IdCodice', vat)}</IdFiscaleIVA>`;
}

function sedeBlock(party: FatturaPaParty): string {
  return [
    '<Sede>',
    tag('Indirizzo', party.address),
    tag('CAP', party.zip),
    tag('Comune', party.city),
    tag('Provincia', party.province),
    tag('Nazione', party.countryCode?.trim() || DEFAULT_COUNTRY),
    '</Sede>',
  ].join('');
}

function lineBlock(line: FatturaPaLine): string {
  const parts = [
    '<DettaglioLinee>',
    tag('NumeroLinea', String(line.lineNumber)),
    tag('Descrizione', line.description),
    tag('Quantita', line.quantity.toFixed(2)),
    tag('PrezzoUnitario', money(line.unitPriceMinor)),
  ];
  if (line.discountPercent > 0) {
    parts.push(
      `<ScontoMaggiorazione><Tipo>SC</Tipo>${tag(
        'Percentuale',
        rate(line.discountPercent),
      )}</ScontoMaggiorazione>`,
    );
  }
  parts.push(
    tag('PrezzoTotale', money(line.lineTotalMinor)),
    tag('AliquotaIVA', rate(line.vatRatePercent)),
  );
  // Natura obbligatoria dallo standard solo con aliquota zero.
  if (line.vatRatePercent === 0 && line.natura) {
    parts.push(tag('Natura', line.natura));
  }
  parts.push('</DettaglioLinee>');
  return parts.join('');
}

function vatSummaryBlock(summary: FatturaPaVatSummary): string {
  const parts = ['<DatiRiepilogo>', tag('AliquotaIVA', rate(summary.ratePercent))];
  if (summary.ratePercent === 0 && summary.natura) {
    parts.push(tag('Natura', summary.natura));
  }
  parts.push(
    tag('ImponibileImporto', money(summary.taxableMinor)),
    tag('Imposta', money(summary.vatMinor)),
    '</DatiRiepilogo>',
  );
  return parts.join('');
}

/**
 * Blocco DatiPagamento: emesso solo se c'è almeno un dato di pagamento reale.
 *
 * `ModalitaPagamento` è un codice normativo MP01–MP23 che VestiFlow non
 * gestisce come tale (le condizioni di pagamento sono testo libero), quindi
 * NON viene emesso: sarebbe un valore inventato. Le condizioni testuali
 * viaggiano come causale, dove sono informative e non normative.
 */
function paymentBlock(input: FatturaPaInput): string {
  const hasPayment = Boolean(input.paymentDueDate || input.iban?.trim());
  if (!hasPayment) {
    return '';
  }
  const details = [
    '<DettaglioPagamento>',
    input.paymentDueDate ? tag('DataScadenzaPagamento', isoDate(input.paymentDueDate)) : '',
    tag('ImportoPagamento', money(input.totalMinor)),
    tag('IBAN', input.iban),
    '</DettaglioPagamento>',
  ].join('');
  return `<DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento>${details}</DatiPagamento>`;
}

/** Blocco DatiDDT: un elemento per ogni DDT agganciato alla fattura. */
function ddtBlock(input: FatturaPaInput): string {
  return (input.linkedDdts ?? [])
    .map(
      (ddt) =>
        `<DatiDDT>${tag('NumeroDDT', ddt.reference)}${tag('DataDDT', isoDate(ddt.date))}</DatiDDT>`,
    )
    .join('');
}

/** Genera l'XML FatturaPA completo del documento. */
export function buildFatturaPaXml(input: FatturaPaInput): string {
  const transmitterVat = input.cedente.vatNumber?.trim();
  const transmitterCountry = input.cedente.countryCode?.trim() || DEFAULT_COUNTRY;

  const header = [
    '<FatturaElettronicaHeader>',
    '<DatiTrasmissione>',
    // Il trasmittente coincide col cedente: VestiFlow non gestisce
    // intermediari di trasmissione distinti.
    transmitterVat
      ? `<IdTrasmittente>${tag('IdPaese', transmitterCountry)}${tag(
          'IdCodice',
          transmitterVat,
        )}</IdTrasmittente>`
      : '',
    tag('ProgressivoInvio', input.number),
    '<FormatoTrasmissione>FPR12</FormatoTrasmissione>',
    tag('CodiceDestinatario', input.sdiCode?.trim() || DEFAULT_SDI_CODE),
    input.pec?.trim() ? `<PECDestinatario>${escapeXml(input.pec.trim())}</PECDestinatario>` : '',
    '</DatiTrasmissione>',
    '<CedentePrestatore>',
    '<DatiAnagrafici>',
    idFiscaleIvaBlock(input.cedente),
    tag('CodiceFiscale', input.cedente.fiscalCode),
    anagraficaBlock(input.cedente),
    `<RegimeFiscale>${DEFAULT_TAX_REGIME}</RegimeFiscale>`,
    '</DatiAnagrafici>',
    sedeBlock(input.cedente),
    '</CedentePrestatore>',
    '<CessionarioCommittente>',
    '<DatiAnagrafici>',
    idFiscaleIvaBlock(input.cessionario),
    tag('CodiceFiscale', input.cessionario.fiscalCode),
    anagraficaBlock(input.cessionario),
    '</DatiAnagrafici>',
    sedeBlock(input.cessionario),
    '</CessionarioCommittente>',
    '</FatturaElettronicaHeader>',
  ].join('');

  const body = [
    '<FatturaElettronicaBody>',
    '<DatiGenerali>',
    '<DatiGeneraliDocumento>',
    `<TipoDocumento>${input.documentTypeCode}</TipoDocumento>`,
    tag('Divisa', input.currency),
    tag('Data', isoDate(input.documentDate)),
    tag('Numero', input.number),
    tag('ImportoTotaleDocumento', money(input.totalMinor)),
    input.notes?.trim() ? tag('Causale', input.notes) : '',
    '</DatiGeneraliDocumento>',
    ddtBlock(input),
    '</DatiGenerali>',
    '<DatiBeniServizi>',
    input.lines.map(lineBlock).join(''),
    input.vatSummaries.map(vatSummaryBlock).join(''),
    '</DatiBeniServizi>',
    paymentBlock(input),
    '</FatturaElettronicaBody>',
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<p:FatturaElettronica versione="FPR12" ',
    'xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" ',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    header,
    body,
    '</p:FatturaElettronica>',
  ].join('');
}

/**
 * Nome file secondo la convenzione SDI: IT{PIVA}_{progressivo}.xml.
 * Senza partita IVA si ripiega sul solo numero documento — l'alternativa
 * sarebbe inventare un identificativo fiscale.
 */
export function fatturaPaFileName(vatNumber: string | null | undefined, number: string): string {
  const sanitizedNumber = number.replace(/[^A-Za-z0-9]/g, '');
  const vat = vatNumber?.trim();
  return vat ? `IT${vat}_${sanitizedNumber}.xml` : `${sanitizedNumber}.xml`;
}
