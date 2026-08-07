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
  /**
   * Quota dello sconto testata ripartita sulla riga (secondo blocco
   * ScontoMaggiorazione): il totale riga è già al netto di entrambi gli sconti.
   */
  readonly extraDiscountPercent?: number;
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
  /** Regime fiscale RF01–RF19: solo cedente; default RF01 se assente. */
  readonly taxRegime?: string | null;
}

/** Scadenza di pagamento: un DettaglioPagamento per rata. */
export interface FatturaPaInstallment {
  readonly dueDate: Date;
  readonly amountMinor: number;
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
  /**
   * Modalità di pagamento normativa (MP01–MP23), estratta dal nome della
   * PaymentOption. Senza codice il blocco DatiPagamento non viene emesso:
   * ModalitaPagamento è obbligatoria dallo schema e non si inventa.
   */
  readonly paymentMethodCode?: string | null;
  /** Rate di pagamento: se presenti, CondizioniPagamento diventa TP01. */
  readonly installments?: readonly FatturaPaInstallment[];
  /** Riferimenti DDT agganciati (blocco DatiDDT). */
  readonly linkedDdts?: readonly { readonly reference: string; readonly date: Date }[];
  /** Fatture rettificate da una nota di credito (blocco DatiFattureCollegate). */
  readonly linkedInvoices?: readonly { readonly reference: string; readonly date: Date }[];
  readonly notes?: string | null;
}

/**
 * Codice destinatario di default previsto dallo standard quando non è noto:
 * sette zeri. Non è un placeholder inventato — è il valore che lo standard
 * impone per i casi in cui la trasmissione avviene per altra via (es. PEC).
 */
const DEFAULT_SDI_CODE = '0000000';

/** Regime fiscale di ripiego quando il cedente non lo dichiara: RF01 ordinario. */
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

/**
 * PrezzoUnitario: lo standard ammette fino a 8 decimali, e la coda decimale
 * del netto canonico (§sei decimali) va emessa per intero — troncare al
 * centesimo farebbe fallire il ricalcolo SDI PrezzoUnitario × Quantità
 * (controllo 00423) già con poche unità. Minimo due decimali, zeri di coda
 * oltre il secondo rimossi.
 */
function unitPrice(amountMinor: number): string {
  const fixed = (amountMinor / 100).toFixed(8);
  const trimmed = fixed.replace(/0+$/, '');
  const decimals = trimmed.length - trimmed.indexOf('.') - 1;
  return decimals >= 2 ? trimmed : (amountMinor / 100).toFixed(2);
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
    tag('PrezzoUnitario', unitPrice(line.unitPriceMinor)),
  ];
  if (line.discountPercent > 0) {
    parts.push(
      `<ScontoMaggiorazione><Tipo>SC</Tipo>${tag(
        'Percentuale',
        rate(line.discountPercent),
      )}</ScontoMaggiorazione>`,
    );
  }
  // Sconto testata: ripartito sulle righe come secondo sconto in cascata,
  // così la somma dei PrezzoTotale torna con i DatiRiepilogo (controllo 00422).
  if ((line.extraDiscountPercent ?? 0) > 0) {
    parts.push(
      `<ScontoMaggiorazione><Tipo>SC</Tipo>${tag(
        'Percentuale',
        rate(line.extraDiscountPercent ?? 0),
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
 * Blocco DatiPagamento: emesso solo se la modalità normativa è nota.
 *
 * `ModalitaPagamento` (MP01–MP23) è obbligatoria dallo schema dentro ogni
 * DettaglioPagamento: senza codice il blocco intero si omette — un
 * DatiPagamento senza modalità sarebbe non conforme, uno con modalità
 * inventata sarebbe falso. Il codice arriva dal nome della PaymentOption
 * (es. «Bonifico (MP05)»), mai dedotto da altro.
 *
 * Con le rate il pagamento è TP01 (a rate) e ogni rata è un
 * DettaglioPagamento; senza rate resta TP02 (completo) in un solo dettaglio.
 */
function paymentBlock(input: FatturaPaInput): string {
  const methodCode = input.paymentMethodCode?.trim();
  if (!methodCode) {
    return '';
  }
  const installments = input.installments ?? [];
  const details =
    installments.length > 0
      ? installments.map((installment) =>
          [
            '<DettaglioPagamento>',
            tag('ModalitaPagamento', methodCode),
            tag('DataScadenzaPagamento', isoDate(installment.dueDate)),
            tag('ImportoPagamento', money(installment.amountMinor)),
            tag('IBAN', input.iban),
            '</DettaglioPagamento>',
          ].join(''),
        )
      : [
          [
            '<DettaglioPagamento>',
            tag('ModalitaPagamento', methodCode),
            input.paymentDueDate ? tag('DataScadenzaPagamento', isoDate(input.paymentDueDate)) : '',
            tag('ImportoPagamento', money(input.totalMinor)),
            tag('IBAN', input.iban),
            '</DettaglioPagamento>',
          ].join(''),
        ];
  // Rate presenti = pagamento a rate (TP01), anche con una sola scadenza: un
  // acconto singolo dichiarato TP02 («completo») con importo parziale sarebbe
  // un dato falso. TP01 con un solo DettaglioPagamento è valido per lo schema.
  const conditions = installments.length > 0 ? 'TP01' : 'TP02';
  return `<DatiPagamento><CondizioniPagamento>${conditions}</CondizioniPagamento>${details.join('')}</DatiPagamento>`;
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

/**
 * Blocco DatiFattureCollegate: sulla nota di credito, il riferimento alla
 * fattura che viene rettificata. Nello schema precede DatiDDT.
 */
function linkedInvoicesBlock(input: FatturaPaInput): string {
  return (input.linkedInvoices ?? [])
    .map(
      (invoice) =>
        `<DatiFattureCollegate>${tag('IdDocumento', invoice.reference)}${tag(
          'Data',
          isoDate(invoice.date),
        )}</DatiFattureCollegate>`,
    )
    .join('');
}

/** Genera l'XML FatturaPA completo del documento. */
export function buildFatturaPaXml(input: FatturaPaInput): string {
  const transmitterVat = input.cedente.vatNumber?.trim();
  const transmitterCountry = input.cedente.countryCode?.trim() || DEFAULT_COUNTRY;
  const sdiCode = input.sdiCode?.trim() || DEFAULT_SDI_CODE;
  // ProgressivoInvio: String10Type, max 10 caratteri. Il riferimento «FT-2026-
  // 0001» sanificato ai soli alfanumerici resta univoco per serie e numero; se
  // eccede si tengono gli ultimi 10 — il valore non ha significato di business,
  // serve solo a distinguere gli invii del trasmittente.
  const progressivoInvio = input.number.replace(/[^A-Za-z0-9]/g, '').slice(-10);

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
    tag('ProgressivoInvio', progressivoInvio),
    '<FormatoTrasmissione>FPR12</FormatoTrasmissione>',
    tag('CodiceDestinatario', sdiCode),
    // PECDestinatario è ammessa SOLO con CodiceDestinatario 0000000 (controllo
    // SDI 00426): con un codice reale la PEC non si emette.
    sdiCode === DEFAULT_SDI_CODE && input.pec?.trim()
      ? `<PECDestinatario>${escapeXml(input.pec.trim())}</PECDestinatario>`
      : '',
    '</DatiTrasmissione>',
    '<CedentePrestatore>',
    '<DatiAnagrafici>',
    idFiscaleIvaBlock(input.cedente),
    tag('CodiceFiscale', input.cedente.fiscalCode),
    anagraficaBlock(input.cedente),
    `<RegimeFiscale>${escapeXml(input.cedente.taxRegime?.trim() || DEFAULT_TAX_REGIME)}</RegimeFiscale>`,
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
    linkedInvoicesBlock(input),
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
 * Nome file secondo la convenzione SDI: IT{PIVA}_{progressivo}.xml, con il
 * progressivo alfanumerico di MAX 5 caratteri. Dal riferimento sanificato si
 * tengono gli ultimi 5 («FT-2026-0001» → «60001»): numeri diversi nello stesso
 * anno restano distinti; il troncamento può collidere tra anni o serie diverse,
 * ma il nome serve solo alla trasmissione del singolo file. Senza partita IVA
 * si ripiega sul solo progressivo — l'alternativa sarebbe inventare un
 * identificativo fiscale.
 */
export function fatturaPaFileName(vatNumber: string | null | undefined, number: string): string {
  const progressivo = number.replace(/[^A-Za-z0-9]/g, '').slice(-5);
  const vat = vatNumber?.trim();
  return vat ? `IT${vat}_${progressivo}.xml` : `${progressivo}.xml`;
}
