# 06b · Estrazione tecnica da `feature/fattura-elettronica`

**Data:** 15/08/2026
**Perché esiste:** il ramo `feature/fattura-elettronica` viene **cancellato** (decisione di Luigi, 15/08). Il suo unico commit (7/08/2026, 68 file, +2305/-378) è stato archiviato in un tag locale prima della cancellazione:

```
git tag -a archivio/fattura-elettronica 7866b80f
git show archivio/fattura-elettronica:<percorso-file>
```

Questo documento estrae dal commit archiviato ciò che vale la pena riportare quando si riscrive la famiglia Fattura su `develop`, confrontato punto per punto con quello che `develop` ha **davvero oggi** — non quello che si presume abbia.

---

## ⚠️ Come leggere questo documento — tre piani, non uno

Il ramo è del 7 agosto: **vecchio**, senza revisione indipendente, e le sue affermazioni sulle regole fiscali SDI **non sono state verificate su fonte ufficiale**. Prima di prendere per buono un suo dato, va controllato — solo per quelli che servono davvero, non tutti in anticipo.

Tre piani, tenuti separati in ogni voce:

| Piano                                           | Grado                                                                                            | Esempio                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **Cosa fa il codice** (ramo e develop)          | **verificato** — letto con `git show`, `git diff`, grep mirati                                   | «`document-xml.service.ts:92` legge `snapshot.natura`» |
| **Cosa il ramo _afferma_ sulla regola fiscale** | **NON verificato** — è quello che dice il commento del ramo, non una fonte ufficiale controllata | «il controllo SDI 00423 richiede…»                     |
| **Cosa ha `develop` oggi**                      | **verificato** — stesso metodo del primo piano                                                   | «`develop` tronca a due decimali»                      |

Ogni volta che compare un **codice di controllo SDI** (00400, 00422, 00423, 00426, 00427), un riferimento al **tracciato FatturaPA** (String10Type, MP01-23, RF01-19), o un **algoritmo di checksum**, è un'affermazione del piano centrale: prima di implementarla, verificarla sull'Elenco dei controlli ufficiale (`fatturapa.gov.it`) o sulle specifiche tecniche del tracciato in vigore. L'elenco completo di cosa verificare è in fondo, §G.

**Metodo di ricostruzione**, per trasparenza: 5 agenti hanno esaminato in parallelo le aree del commit, ognuno confrontando ogni pezzo con `develop` letto via git — mai presunto. Un sesto ha ricostruito i 14 difetti dichiarati (ma non elencati) dal commit, leggendo l'intero diff e verificando ogni candidato su `develop` oggi.

---

## §A — XML FatturaPA e controlli SDI

File del ramo: `api/src/documents/fatturapa-xml.util.ts` (+154/-27), `api/src/documents/document-xml.service.ts` (+133/-32), `api/src/documents/sdi-payment.util.ts` (nuovo, 17 righe), più tre file di test.

**Sintesi.** Dei dodici punti che il commit dichiara per quest'area, **uno solo è già in `develop`** (RegimeFiscale — vedi §E). Gli altri undici mancano tutti, e **quattro sono difetti vivi su `develop` oggi**, verificati con git — non nel senso che il ramo li descrive correttamente, ma nel senso che il codice che il ramo correggeva è ancora lì, tale e quale.

### A.1 — La Natura non esce mai dall'XML (verificato: chiave sbagliata)

**Cosa fa il codice, verificato.** `document-xml.service.ts:92` di `develop` legge `snapshot?.natura`. Ma l'unico scrittore dello snapshot IVA, `buildVatCodeSnapshot` (`vat-snapshot.util.ts:16`), scrive la chiave `officialCode` — mai `natura`. Quindi `<Natura>` **non esce mai** dall'XML di `develop`, su nessuna riga.

**Cosa afferma il ramo (da verificare).** Una riga ad aliquota 0 senza `<Natura>` verrebbe scartata dallo SDI — cita il controllo **00400**.

**Correzione del ramo:**

```ts
/** Codici Natura ammessi dallo standard: N1–N7, con sottocodice opzionale. */
const NATURA_PATTERN = /^N[1-7](\.\d)?$/;

interface LineVatSnapshot {
  readonly ratePercent?: number;
  readonly officialCode?: string | null;
}

function naturaFromSnapshot(snapshot: LineVatSnapshot | null): string | undefined {
  const code = snapshot?.officialCode?.trim();
  return code && NATURA_PATTERN.test(code) ? code : undefined;
}

// nel map delle righe:
natura: naturaFromSnapshot(snapshot),
```

Il filtro N1-N7 serve perché il catalogo IVA di `develop` contiene pseudo-codici interni con `officialCode: null` (TAXABLE, PURCHASE_REVERSE_CHARGE, SPLIT_PAYMENT, OTHER) — senza filtro uscirebbero come valori non conformi.

**Verdetto: da riportare.**

### A.2 — Un `DatiRiepilogo` per (aliquota, Natura), non per sola aliquota

**Cosa fa il codice, verificato.** `document-xml.service.ts:160-180` di `develop` raggruppa con `new Map<number, …>` sulla sola `line.vatRatePercent`, e alla riga 176 fa `natura: current.natura ?? line.natura` — tiene la Natura della prima riga del gruppo.

**Cosa afferma il ramo (da verificare).** Due righe a 0% con Natura diversa (es. esente N4 e non soggetto N2.2) sarebbero due riepiloghi distinti per lo standard, non uno solo.

**Nota**: oggi il punto è **latente** su `develop`, perché la Natura non arriva mai (A.1). Diventa visibile solo correggendo A.1 — le due correzioni vanno insieme.

```ts
export function summarizeVat(lines: readonly FatturaPaLine[]): FatturaPaVatSummary[] {
  const byGroup = new Map<string, FatturaPaVatSummary>();
  for (const line of lines) {
    const key = `${line.vatRatePercent}|${line.natura ?? ''}`;
    const current = byGroup.get(key) ?? {
      ratePercent: line.vatRatePercent,
      taxableMinor: 0,
      vatMinor: 0,
      natura: line.natura,
    };
    const taxableMinor = current.taxableMinor + line.lineTotalMinor;
    byGroup.set(key, {
      ratePercent: line.vatRatePercent,
      taxableMinor,
      // L'imposta si calcola sul totale dell'aliquota, non sommando gli
      // arrotondamenti di riga: è così che la somma torna col totale documento.
      vatMinor: Math.round((taxableMinor * line.vatRatePercent) / 100),
      natura: current.natura,
    });
  }
  return [...byGroup.values()].sort(
    (a, b) => a.ratePercent - b.ratePercent || (a.natura ?? '').localeCompare(b.natura ?? ''),
  );
}
```

**Verdetto: da riportare adattando** (nessun adattamento di sostanza — la formula è identica).

### A.3 — `PrezzoUnitario` troncato al centesimo (verificato: coda persa due volte)

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:227` di `develop` usa `money(line.unitPriceMinor)` — arrotonda a due decimali. E `document-xml.service.ts:88` fa `Math.round(Number(line.unitPriceMinor))` **prima** ancora, col commento «Punto di uscita (XML fattura): due decimali (§sei decimali)». La coda decimale del netto canonico (che `develop` consolida ovunque altrove — `Decimal(16,6)`, commento «SEI DECIMALI» in `schema.prisma:2265`) si perde due volte in questo file.

**Cosa afferma il ramo (da verificare).** Il controllo SDI **00423** ricalcolerebbe `PrezzoTotale` da `PrezzoUnitario × Quantità` e rifiuterebbe il file se non torna; lo standard ammetterebbe fino a 8 decimali.

```ts
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

// lineBlock:  tag('PrezzoUnitario', unitPrice(line.unitPriceMinor)),
// mapper:     unitPriceMinor: Number(line.unitPriceMinor),   // NIENTE Math.round
// atteso nel test: 2049.180328 → <PrezzoUnitario>20.49180328</PrezzoUnitario>
```

Caso di prova del ramo: 25,00 € ivati al 22% = netto esatto 2049,180328 unità minori → `<PrezzoUnitario>20.49180328</PrezzoUnitario>`.

**Verdetto: da riportare.**

### A.4 — Sconto testata mai ripartito sulle righe (verificato: l'XML non quadra con sé stesso)

**Cosa fa il codice, verificato.** `document-xml.service.ts` di `develop` non legge mai `document.documentDiscountPercent`. Le righe entrano nell'XML al lordo dello sconto testata, mentre `ImportoTotaleDocumento` (da `document.totalMinor`) è già scontato — **il file non torna con sé stesso**. Esempio verificabile: fattura da 100,00 netti con 10% di sconto testata → `PrezzoTotale` 100.00, `ImponibileImporto` 100.00, `ImportoTotaleDocumento` 109.80.

**Cosa afferma il ramo (da verificare).** Nel tracciato FatturaPA lo sconto di testata (2.1.1.8 ScontoMaggiorazione) non modificherebbe i `DatiRiepilogo` — per ridurre l'imponibile serve agire sulle righe. Cita il controllo **00422**.

**Nota importante**: la formula di ripartizione **coincide già** con quella usata da `develop` nei totali persistiti (`documents.service.ts:3559-3561`) — quella scelta è già verificata fiscalmente corretta su questo progetto (`docs/01-registro-difetti-shopify.md:816`). Manca solo che l'XML la applichi.

```ts
export function applyDocumentDiscount(
  lines: readonly FatturaPaLine[],
  documentDiscountPercent: number,
): readonly FatturaPaLine[] {
  const docDiscount = Math.min(100, Math.max(0, documentDiscountPercent));
  if (docDiscount === 0 || lines.length === 0) {
    return lines;
  }
  const lineSum = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (lineSum === 0) {
    return lines;
  }
  const discountedLineSum = lineSum - Math.round((lineSum * docDiscount) / 100);
  const discounted = lines.map((line) =>
    Math.round(discountedLineSum * (line.lineTotalMinor / lineSum)),
  );
  const residual = discountedLineSum - discounted.reduce((sum, value) => sum + value, 0);
  if (residual !== 0) {
    let largest = 0;
    for (let i = 1; i < discounted.length; i++) {
      if ((discounted[i] ?? 0) > (discounted[largest] ?? 0)) {
        largest = i;
      }
    }
    discounted[largest] = (discounted[largest] ?? 0) + residual;
  }
  return lines.map((line, index) => ({
    ...line,
    lineTotalMinor: discounted[index] ?? line.lineTotalMinor,
    extraDiscountPercent: docDiscount,
  }));
}

// in lineBlock, DOPO il blocco dello sconto riga:
if ((line.extraDiscountPercent ?? 0) > 0) {
  parts.push(
    `<ScontoMaggiorazione><Tipo>SC</Tipo>${tag('Percentuale', rate(line.extraDiscountPercent ?? 0))}</ScontoMaggiorazione>`,
  );
}
```

**Perché la formula dev'essere questa esatta espressione**: le due forme algebricamente equivalenti (quota-poi-moltiplica vs moltiplica-poi-quota) divergono in floating-point sui confini `.5`. E il residuo di arrotondamento va assorbito sulla riga più grande — senza, la somma delle quote può sfalsare di un centesimo (caso limite: righe da 1 e 97 centesimi, sconto 50%, montante 49 — senza correzione le quote sommano 48 o 50).

**Verdetto: da riportare adattando.**

### A.5 — `ImportoTotaleDocumento` non ricostruibile dai riepiloghi (decisione, non porting)

**Cosa fa il codice, verificato.** `document-xml.service.ts:110` di `develop` passa `totalMinor: document.totalMinor` — il totale persistito. `develop` calcola oggi l'imposta **riga per riga** (`lineVatFromNetExact`, arrotondamento sui due estremi netto/lordo), mentre il ramo calcolava l'imposta di riepilogo **per gruppo di aliquota** (`Math.round(taxableMinor * rate / 100)`). Le due forme possono divergere di centesimi.

**Cosa afferma il ramo (da verificare).** La fattura dovrebbe quadrare con sé stessa prima che col gestionale — chi riceve l'XML somma i riepiloghi e confronta col totale dichiarato.

```ts
const vatSummaries = summarizeVat(lines);
const totalMinor = vatSummaries.reduce(
  (sum, summary) => sum + summary.taxableMinor + summary.vatMinor,
  0,
);
// … buildFatturaPaXml({ totalMinor, vatSummaries, … })
```

**⚠️ È una decisione da prendere, non un porting meccanico**: il divario fra le due forme è **cresciuto**, non diminuito, da quando il ramo l'ha misurato — perché `develop` ha nel frattempo spostato l'imposta persistita su `lineVatFromNetExact`. Va scelto se la fattura quadra con sé stessa (ricostruendo dai riepiloghi) o col gestionale (allineando l'imposta di riepilogo alla formula esatta di `develop`).

**Verdetto: da riportare adattando** — ma solo dopo la decisione.

### A.6 — `PECDestinatario` emessa anche con codice destinatario reale

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:314-315` di `develop` scrive `CodiceDestinatario` e `PECDestinatario` **in modo indipendente**: un cliente con entrambi in anagrafica produce oggi un file con entrambi valorizzati.

**Cosa afferma il ramo (da verificare).** Il controllo SDI **00426** ammetterebbe `PECDestinatario` **solo** quando `CodiceDestinatario` vale il default `0000000` — sono due canali alternativi, non cumulabili.

```ts
const sdiCode = input.sdiCode?.trim() || DEFAULT_SDI_CODE;
// …
tag('CodiceDestinatario', sdiCode),
// PECDestinatario è ammessa SOLO con CodiceDestinatario 0000000 (controllo
// SDI 00426): con un codice reale la PEC non si emette.
sdiCode === DEFAULT_SDI_CODE && input.pec?.trim()
  ? `<PECDestinatario>${escapeXml(input.pec.trim())}</PECDestinatario>`
  : '',
```

**Verdetto: da riportare.**

### A.7 — `ProgressivoInvio` oltre il limite dichiarato dallo standard

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:312` di `develop` scrive `tag('ProgressivoInvio', input.number)` senza alcun limite.

**Cosa afferma il ramo (da verificare).** Il campo sarebbe di tipo `String10Type` — max 10 caratteri alfanumerici — e un riferimento come `FT-2026-A-00042` sanificato ne fa 12.

```ts
// ProgressivoInvio: String10Type, max 10 caratteri. Il riferimento «FT-2026-
// 0001» sanificato ai soli alfanumerici resta univoco per serie e numero; se
// eccede si tengono gli ultimi 10 — il valore non ha significato di business,
// serve solo a distinguere gli invii del trasmittente.
const progressivoInvio = input.number.replace(/[^A-Za-z0-9]/g, '').slice(-10);
// …
tag('ProgressivoInvio', progressivoInvio),
```

**⚠️ Collegamento con `docs/04-specifica-numerazione-documenti.md` §11** (deciso il 13/08, sette giorni dopo il ramo): quella specifica stabilisce che `<Numero>` deve contenere solo il numero fiscale («19», non «FT-0019»), e **nomina esplicitamente questo test del ramo** come «scelta consolidata da correggere insieme» — la decisione si prende in due, non da una parte sola. Il troncamento a 10 resta necessario; l'**ingresso** (`input.number`) deve diventare il numero fiscale deciso dal §11, non `document.reference`.

**Verdetto: da riportare adattando** — dopo aver riletto il §11.

### A.8 — Nome file SDI oltre il limite dichiarato

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:376-380` di `develop` sanifica ma non tronca: `FT-2026-0001` → `IT01234567890_FT20260001.xml`, 10 caratteri di progressivo nel nome.

**Cosa afferma il ramo (da verificare).** La convenzione SDI vorrebbe un progressivo di **massimo 5 caratteri** dopo l'identificativo fiscale.

```ts
export function fatturaPaFileName(vatNumber: string | null | undefined, number: string): string {
  const progressivo = number.replace(/[^A-Za-z0-9]/g, '').slice(-5);
  const vat = vatNumber?.trim();
  return vat ? `IT${vat}_${progressivo}.xml` : `${progressivo}.xml`;
}
// 'FT-2026-0001' → IT01234567890_60001.xml
```

**Stessa dipendenza del punto A.7** dal §11 di `04`: decidere insieme cosa si tronca.

**Verdetto: da riportare adattando.**

### A.9 — `sdi-payment.util.ts`: estrazione del codice `MP01`-`MP23`

**Cosa fa il codice, verificato.** Il file **non esiste** su `develop`. Ma la premessa su cui si regge è già lì e più solida di quando il ramo l'ha scritta: `api/src/payment-options/payment-option-seed.data.ts:21-44` definisce `SDI_PAYMENT_METHOD_NAMES` con tutti e 23 i nomi nella forma «Contanti (MP01)» … «PagoPA (MP23)», col commento «il codice fa parte del nome: le anagrafiche salvano il nome come snapshot».

**Cosa afferma il ramo (da verificare).** `ModalitaPagamento` (2.4.2.2) sarebbe un codice obbligatorio dello schema dentro ogni `DettaglioPagamento`.

```ts
const SDI_PAYMENT_METHOD_PATTERN = /\(MP(0[1-9]|1\d|2[0-3])\)\s*$/;

/** Estrae il codice MP01–MP23 dal nome della modalità di pagamento, se c'è. */
export function sdiPaymentMethodCode(paymentMethod: string | null | undefined): string | null {
  const match = paymentMethod?.trim().match(SDI_PAYMENT_METHOD_PATTERN);
  return match ? `MP${match[1]}` : null;
}
```

La regex è ancorata **in coda** (`\s*$`) apposta: una voce personalizzata che citi un codice a metà frase non viene scambiata per una modalità normativa. Attenzione a un'omonimia: `Document.paymentMethod` su `develop` è usato anche per cash/card/other della Vendita in negozio (`schema.prisma:2165`) — la funzione restituisce correttamente `null` su quei valori.

**Verdetto: da riportare, identico.**

### A.10 — `DatiPagamento` senza `ModalitaPagamento`: blocco potenzialmente non conforme

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:262-283` di `develop` emette `DatiPagamento` con `TP02` fisso, un solo dettaglio, **senza** `ModalitaPagamento` — con un commento che dichiara la scelta: «VestiFlow non gestisce i codici MP01–MP23, sarebbe un valore inventato». Un test fissa questo comportamento (`fatturapa-xml.util.spec.ts:189`).

**Cosa afferma il ramo (da verificare).** `ModalitaPagamento` sarebbe obbligatoria; un blocco senza modalità sarebbe non conforme, uno con modalità inventata sarebbe falso — quindi in assenza di codice noto il blocco andrebbe omesso del tutto.

```ts
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
```

**Adattamenti**: (1) `DocumentPaymentInstallment` esiste già su `develop` ma è destinata alla «Registrazione fattura fornitore» — sul lato **vendita** le rate oggi non si compilano, quindi TP01 resta inerte finché non si porta anche la tabella scadenze lato vendita (§C). (2) Il commento vecchio in `fatturapa-xml.util.ts` va rimosso, non lasciato a contraddire il codice nuovo. (3) Il test `fatturapa-xml.util.spec.ts:189` **va riscritto**, non aggirato — il commento che accompagna la scelta vecchia resta valido come motivazione di `methodCode === null`.

**Verdetto: da riportare adattando.**

### A.11 — `TD04` e `DatiFattureCollegate` per la nota di credito

Vedi §D — è lavoro trasversale alla Nota di credito, trattato lì per intero.

### A.12 — Regime fiscale: già fatto, meglio

Vedi §E.

---

## §B — Validatori fiscali (P.IVA, codice fiscale, codice SDI)

File del ramo: `src/app/domain/customers/utils/customer-fiscal.validators.ts` (136 righe) + spec (82 righe) + 28 righe di aggancio nel componente condiviso dei campi cliente.

**Sintesi, verificato con grep mirato.** `git grep -E '% 26|charCodeAt\(0\) - 65|doubled|carattere di controllo' origin/develop -- src api` **non restituisce una riga**. `develop` ha solo `italianVatValidator()` (`/^\d{11}$/`, sola lunghezza) sull'anagrafica azienda. Sul **cliente**, P.IVA, codice fiscale e codice SDI **non sono validati né nel form né nella DTO API**.

I due algoritmi di checksum sono il pezzo che costa fatica riscrivere: **vanno copiati testualmente**, non reinventati — in particolare la tabella del codice fiscale non è derivabile.

### B.1 — Checksum P.IVA (11 cifre)

**Cosa afferma il ramo (da verificare — cita «Luhn art. 35 DPR 633/72»).**

```ts
/** Checksum di partita IVA e codice fiscale numerico (algoritmo Luhn art. 35 DPR 633/72). */
function hasValidVatChecksum(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[10]);
}
```

**Verdetto: da riportare.**

### B.2 — Checksum codice fiscale 16 caratteri (tabella DM 12/03/1974)

**Cosa afferma il ramo (da verificare — cita «Tabelle ufficiali del carattere di controllo del codice fiscale», DM 12/03/1974).** La tabella dei valori dispari **non è derivabile né indovinabile**: 0→1, 1→0, 2→5, 3→7, 4→9, 5→13… — è il pezzo che va copiato, non reinventato.

```ts
// Tabelle ufficiali del carattere di controllo del codice fiscale (DM 12/03/1974).
const CF_ODD_VALUES: Readonly<Record<string, number>> = {
  '0': 1,
  '1': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 13,
  '6': 15,
  '7': 17,
  '8': 19,
  '9': 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

function cfEvenValue(char: string): number {
  return char >= '0' && char <= '9' ? Number(char) : char.charCodeAt(0) - 65;
}

function hasValidTaxCodeChecksum(code: string): boolean {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = code[i] as string;
    // Posizioni 1-based: dispari usano la tabella ODD, pari la conversione diretta.
    sum += i % 2 === 0 ? (CF_ODD_VALUES[char] ?? 0) : cfEvenValue(char);
  }
  return String.fromCharCode(65 + (sum % 26)) === code[15];
}
```

**Verdetto: da riportare.**

### B.3 — La doppia forma: 16 caratteri o 11 cifre

**Cosa afferma il ramo (da verificare).** In Italia il «codice fiscale» di una società è la partita IVA: un validatore che pretendesse sempre 16 caratteri boccerebbe le anagrafiche B2B. Il pattern gestisce anche l'**omocodia** (cifre sostituite da lettere nelle posizioni numeriche): per questo anno/giorno/codice catastale sono `[A-Z0-9]`, non `[0-9]`.

```ts
const VAT_NUMBER_PATTERN = /^\d{11}$/;
const TAX_CODE_PATTERN = /^[A-Z]{6}[A-Z0-9]{2}[A-Z][A-Z0-9]{2}[A-Z][A-Z0-9]{3}[A-Z]$/;

/** Partita IVA italiana: vuota o 11 cifre con checksum corretto. */
export function isValidItalianVatNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return VAT_NUMBER_PATTERN.test(trimmed) && hasValidVatChecksum(trimmed);
}

/**
 * Codice fiscale: vuoto, 16 caratteri con checksum (persone fisiche, omocodia
 * inclusa) oppure 11 cifre con checksum P.IVA (soggetti giuridici).
 */
export function isValidItalianTaxCode(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return true;
  if (VAT_NUMBER_PATTERN.test(trimmed)) {
    return hasValidVatChecksum(trimmed);
  }
  return TAX_CODE_PATTERN.test(trimmed) && hasValidTaxCodeChecksum(trimmed);
}
```

**Verdetto: da riportare.**

### B.4 — Codice SDI a 7 caratteri: ⚠️ contraddizione da risolvere, non da portare a occhi chiusi

**Cosa fa il codice, verificato.** `api/src/customers/dto/create-customer.dto.ts` di `develop` ha il commento «Codice destinatario SDI: 7 caratteri (**6 per la PA**)» con `@MaxLength(7)` — ammette esplicitamente il caso a 6 che il validatore del ramo rifiuta. **Le due frasi non possono convivere.**

**Cosa afferma il ramo (da verificare — cita il controllo 00427).** Solo il formato B2B a 7 caratteri: il generatore trasmetterebbe in FPR12, e un codice ufficio PA a 6 caratteri (formato FPA12) verrebbe scartato.

**Il fatto tecnico verificato dà ragione al ramo**: `fatturapa-xml.util.ts:313` di `develop` scrive `<FormatoTrasmissione>FPR12</FormatoTrasmissione>` **fisso** — non emette mai FPA12.

```ts
// Solo il formato B2B a 7 caratteri: il generatore trasmette in FPR12, e un
// codice ufficio PA a 6 caratteri verrebbe scartato dallo SDI (00427).
const SDI_CODE_PATTERN = /^[A-Z0-9]{7}$/;

/** Codice destinatario SDI: vuoto o 7 caratteri alfanumerici (formato FPR12). */
export function isValidSdiCode(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return !trimmed || SDI_CODE_PATTERN.test(trimmed);
}
```

**Da decidere prima di scrivere**: (a) tenere la regola a 7 e **correggere il commento della DTO**, oppure (b) ammettere il codice a 6 con un avviso diverso («codice PA: VestiFlow trasmette in FPR12, la fattura andrebbe scartata»). Coerente con `docs/GUARDIE-MANCANTI.md:370`, che tratta già `0000000` come ripiego corretto.

**Verdetto: da riportare adattando** — dopo la decisione.

### B.5 — Le tre stringhe di avviso, e il principio «avvisi, non blocchi»

```ts
export const VAT_NUMBER_WARNING_MESSAGE =
  'Partita IVA non valida: servono 11 cifre con carattere di controllo corretto.';
export const TAX_CODE_WARNING_MESSAGE =
  'Codice fiscale non valido: controlla i 16 caratteri (o le 11 cifre per le società).';
export const SDI_CODE_WARNING_MESSAGE =
  'Codice destinatario non valido: servono 7 caratteri alfanumerici.';

export function vatNumberWarning(value: string): string | null {
  return isValidItalianVatNumber(value) ? null : VAT_NUMBER_WARNING_MESSAGE;
}
export function taxCodeWarning(value: string): string | null {
  return isValidItalianTaxCode(value) ? null : TAX_CODE_WARNING_MESSAGE;
}
export function sdiCodeWarning(value: string): string | null {
  return isValidSdiCode(value) ? null : SDI_CODE_WARNING_MESSAGE;
}
```

**Il principio scritto in testa al file del ramo** — perché non blocca il salvataggio:

```ts
/**
 * Verifiche formali dei dati fiscali italiani dell'anagrafica cliente:
 * partita IVA (11 cifre + carattere di controllo), codice fiscale (16
 * caratteri con checksum, o 11 cifre per i soggetti giuridici), codice
 * destinatario SDI (7 caratteri, 6 per la PA).
 *
 * Sono AVVISI non bloccanti (regole-gestionale): un dato malformato farebbe
 * scartare la fattura elettronica dallo SDI, ma non rompe l'integrità del
 * database — l'operatore vede l'avviso e può salvare comunque (es. anagrafiche
 * estere o importate da Shopify). Campo vuoto = sempre valido.
 */
```

⚠️ La riga «6 per la PA» in questo commento contraddice il codice sotto (vedi B.4) — va riscritta secondo la decisione presa lì.

`develop` applica già lo stesso principio con le stesse parole altrove (`company-profile.model.ts:322-326`): il principio è di casa, manca l'applicazione ai campi fiscali del cliente.

**Verdetto: da riportare adattando.**

### B.6 — Aggancio alla maschera cliente

Componente condiviso, usato da **due** maschere: `customer-form.component.html` e il pannello «nuovo cliente» dentro l'ordine (`customer-order-form.component.html`). Riportarlo lì porta l'avviso a entrambe senza altro lavoro.

```ts
protected vatNumberWarning(): string | null {
  return vatNumberWarning(this.formGroup().controls.vatNumber.value);
}
protected taxCodeWarning(): string | null {
  return taxCodeWarning(this.formGroup().controls.taxCode.value);
}
protected sdiCodeWarning(): string | null {
  return sdiCodeWarning(this.formGroup().controls.sdiCode.value);
}
```

```html
@if (vatNumberWarning(); as warning) {
<p class="customer-fields__hint customer-fields__hint--warning" role="status">
  <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
  {{ warning }}
</p>
}
```

```scss
// Avviso fiscale non bloccante (ambra, come «disponibili solo N» sui documenti):
// informa che il dato farebbe scartare la fattura elettronica, mai un blocco.
.customer-fields__hint--warning {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  color: var(--color-warning);
}
```

**Perché `--color-warning` e non `--color-danger`**: il rosso vuol dire «il salvataggio è stato rifiutato»; qui il salvataggio resta libero — stessa distinzione di `--color-field-waiting`.

**Adattamenti verificati**: (1) `develop` ha introdotto nel frattempo `showError(controlName)` e `.customer-fields__field-error` (rosso, bloccante dopo `touched`) per email e PEC nello stesso componente — i due linguaggi vanno tenuti distinti, non unificati. (2) `--color-warning` e `--space-1` esistono in `develop` in **entrambi i temi**, quindi `check:tokens` resta verde. (3) PrimeIcons è ancora in uso.

**Verdetto: da riportare adattando.**

### B.7 — Il test dei validatori: i campioni valgono più dell'algoritmo

**Riscrivere un checksum senza casi di prova è riscriverlo a occhi chiusi.**

```ts
// P.IVA
expect(isValidItalianVatNumber('00000000000')).toBe(true);
expect(isValidItalianVatNumber('12345678903')).toBe(true);
expect(isValidItalianVatNumber('1234567890')).toBe(false); // 10 cifre
expect(isValidItalianVatNumber('1234567890a')).toBe(false); // lettera
expect(isValidItalianVatNumber('12345678901')).toBe(false); // checksum errato

// Codice fiscale
expect(isValidItalianTaxCode('RSSMRA80A01H501U')).toBe(true);
expect(isValidItalianTaxCode('rssmra80a01h501u')).toBe(true); // normalizza
expect(isValidItalianTaxCode('12345678903')).toBe(true); // soggetto giuridico
expect(isValidItalianTaxCode('12345678901')).toBe(false);
expect(isValidItalianTaxCode('RSSMRA80A01H501X')).toBe(false); // checksum errato

// Codice SDI
expect(isValidSdiCode('ABC1234')).toBe(true);
expect(isValidSdiCode('0000000')).toBe(true);
expect(isValidSdiCode('UFABCD')).toBe(false); // codice PA a 6: FPR12 non lo trasmette
```

**Due adattamenti obbligatori**: (1) il ramo usa `describe/it/expect` come global — `develop` richiede l'import esplicito (`import { describe, expect, it } from 'vitest';`), senza il file non compila. (2) `'00000000000'` è checksum-valida ma è una P.IVA che non esiste: se si decide di rifiutare la stringa di soli zeri, va deciso ora e il test aggiornato.

**Verdetto: da riportare adattando.**

### B.8 — Dove collocare i validatori: decisione aperta

Il ramo li mette in `domain/customers/utils/`, un posto che gli altri domini non possono importare senza infrangere la direzione delle dipendenze (`regole-architettura`). `develop` ha gli **stessi campi non validati** anche su fornitori (`supplier-form-fields.component.html`) e sull'anagrafica azienda (dove il controllo di forma è **bloccante** anche lato server — estenderlo lì è una scelta di prodotto, non un travaso meccanico).

**Verdetto: decisione da prendere prima di scrivere**, non un pezzo di codice.

---

## §C — Rate di pagamento sulla fattura di vendita

**Sintesi.** Per la maggior parte è l'estrazione in componente condiviso di codice che `develop` possiede già **inline** nella Registrazione fattura fornitore. Il valore vero non sta nel markup ma in **quattro decisioni** che nessun test coglie e che sarebbe facile riscrivere sbagliate.

### C.1 — Il residuo denormalizzato che segue il totale (la parte non ovvia)

**Cosa fa il codice, verificato.** `Document.outstandingMinor` è una colonna derivata che alimenta il filtro «da saldare» e la stampa. `documents.service.ts` non la scrive **mai** oggi (`grep` su tutto `api/src`: gli unici scrittori sono `goods-receipt-workflow.service.ts:1036,1158`, la fattura fornitore). Il modello Prisma `DocumentPaymentInstallment` **non ha vincoli di tipo documento** — nessuna migration serve per usarlo sulla vendita.

**Perché serve una funzione dedicata**: la Registrazione fattura fornitore invia sempre tutto il form, quindi non incontra mai il problema. Il documento di vendita passa dal PATCH generico, dove un salvataggio può cambiare le righe — e quindi il totale — **senza nominare le rate**. Senza gestire questo caso, il residuo resta fermo sul vecchio totale in silenzio.

```ts
private async syncInvoiceInstallmentsTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
  totalMinor: number,
  installments: readonly DocumentInstallmentDto[] | undefined,
): Promise<void> {
  if (installments === undefined) {
    // Lista non dichiarata: le rate restano intatte, ma il residuo
    // denormalizzato segue comunque il totale (che questo update può aver
    // cambiato) — come fa la Registrazione fattura a ogni salvataggio.
    const existing = await tx.documentPaymentInstallment.findMany({
      where: { documentId },
      select: { settled: true, amountMinor: true },
    });
    if (existing.length === 0) return;
    const existingSettled = existing
      .filter((installment) => installment.settled)
      .reduce((sum, installment) => sum + installment.amountMinor, 0);
    await tx.document.update({
      where: { id: documentId },
      data: { outstandingMinor: Math.max(0, totalMinor - existingSettled) },
    });
    return;
  }
  await tx.documentPaymentInstallment.deleteMany({ where: { documentId } });
  if (installments.length > 0) {
    await tx.documentPaymentInstallment.createMany({
      data: installments.map((installment, index) => ({
        tenantId,
        documentId,
        position: index + 1,
        dueDate: new Date(installment.dueDate),
        amountMinor: installment.amountMinor,
        settled: installment.settled === true,
        settledAt: installment.settledAt ? new Date(installment.settledAt) : null,
      })),
    });
  }
  const settledMinor = installments
    .filter((installment) => installment.settled === true)
    .reduce((sum, installment) => sum + installment.amountMinor, 0);
  await tx.document.update({
    where: { id: documentId },
    data: {
      outstandingMinor: installments.length > 0 ? Math.max(0, totalMinor - settledMinor) : 0,
    },
  });
}
```

**Seconda decisione dentro la stessa funzione**: **senza rate il residuo è 0**, non il totale — l'opposto della fattura fornitore, ed è voluto (lo dice anche il commento della colonna in `schema.prisma`): un documento senza scadenzario non deve finire fra i crediti da incassare.

**Adattamenti**: (1) `isSalesInvoiceDocumentType` esiste già ma copre solo `invoice_draft` + `invoice_accompanying` — il gate va scritto sapendo quali tipi devono avere rate. (2) Il blocco `deleteMany`/`createMany` è **identico** a quello di `goods-receipt-workflow.service.ts:1220-1234`: è il momento di estrarre una util condivisa, non avere due copie che divergeranno. (3) **Nessun test backend esiste** su questa funzione sul ramo — va scritto: salvare rate, poi fare un PATCH che cambia solo le righe senza `installments`, verificare che `outstandingMinor` scenda col nuovo totale.

**Verdetto: da riportare adattando.**

### C.2 — Residuo azzerato all'annullo, filtro che esclude gli annullati — **difetto vivo, indipendente dalle rate**

**Cosa fa il codice, verificato.** `documents.service.ts:2825` scrive `{ status: cancelled, cancelledAt: new Date() }` senza toccare `outstandingMinor`. `documents.service.ts:381` fa `{ outstandingMinor: { gt: 0 } }` **senza** guardiano sullo stato.

```ts
// annullamento
await tx.document.update({
  where: { id },
  // Un annullato non ha più nulla da incassare: il residuo denormalizzato
  // si azzera (le rate restano, sono lo storico dello scadenzario).
  data: { status: DocumentStatus.cancelled, cancelledAt: new Date(), outstandingMinor: 0 },
});

// filtro di lista
...(query.settlement === 'pending'
  ? { outstandingMinor: { gt: 0 }, status: { not: DocumentStatus.cancelled } }
  : query.settlement === 'settled'
    ? { outstandingMinor: { lte: 0 } }
    : {}),
```

**Le due modifiche NON sono ridondanti**: l'azzeramento all'annullo vale solo per i **futuri** annullamenti; le righe già annullate nel database conservano il vecchio `outstandingMinor` (nessuna migration di backfill) — è il guardiano sulla query a coprirle. Riportarne una sola è riportare metà correzione.

**Verdetto: da riportare** — a sé, riguarda già la fattura fornitore in produzione, indipendentemente dalla vendita.

### C.3 — Il duplica scarta le rate e la scadenza dell'originale

**Cosa fa il codice, verificato.** `applyDuplicatePrefill` in `sales-document-form.component.ts` di `develop` azzera numero, serie, data e `relatedDdtRef`, ma **non** azzera `paymentDueDate` — difetto presente oggi, indipendente dalle rate.

```ts
this.form.patchValue({
  documentNumber: null,
  series: '',
  documentDate: new Date().toISOString().slice(0, 10),
  relatedDdtRef: '',
  // Scadenza dell'originale: non appartiene alla copia.
  paymentDueDate: '',
});
this.linkedDdtIds.set([]);
// Copia indipendente, come il duplica della Registrazione fattura:
// niente rate — men che meno quelle già spuntate «saldate», che farebbero
// nascere la copia con residuo zero senza che nessuno abbia incassato.
this.installments.clear();
```

**Adattamento**: `develop` ha sostituito `suppressDirtyMarking` con il wrapper `withoutDirtyMarking(...)` — le righe vanno dentro quel wrapper. `paymentDueDate: ''` è una correzione a sé, portabile subito.

**Verdetto: da riportare adattando.**

### C.4 — Il componente `app-document-installments`

```ts
/**
 * Righe correnti del FormArray, rilette a ogni tick. La copia è necessaria:
 * `controls` è lo stesso array mutato sul posto, e un computed che
 * restituisse sempre quel riferimento non notificherebbe mai il template.
 */
protected readonly groups = computed(() => {
  this.formTick();
  return [...this.installments().controls];
});

/** Aggiunge una rata proponendo il residuo non ancora coperto. */
add(): void {
  const array = this.installments();
  const covered = installmentsCoveredMinor(array.getRawValue(), this.currencyCode());
  const residualMinor = Math.max(0, this.totalGrossMinor() - covered);
  array.push(
    buildInstallmentGroup(this.fb, {
      amountText:
        residualMinor > 0
          ? installmentAmountText({ amountMinor: residualMinor, currencyCode: this.currencyCode() })
          : '',
    }),
  );
  array.markAsDirty();
  this.formTick.update((tick) => tick + 1);
}
```

**Tre adattamenti**: (1) **Mobile**: lo SCSS del ramo dice «niente card view — scorre in orizzontale». Da quando il ramo è nato, `develop` ha portato la vista card su mobile alle righe documento — la scelta va **ridichiarata esplicitamente**, non ereditata. Il markup porta già `data-label` su ogni `<td>`, quindi è a portata. (2) Il pulsante «Aggiungi scadenza» sta fuori dal componente (`installmentsTable.add()` via template ref) — valutare un `input()` di configurazione. (3) `formTick` + subscription manuale è il meccanismo di invalidazione: se `develop` ha nel frattempo un helper «FormArray → signal», usarlo.

**Verdetto: da riportare adattando.**

### C.5 — `document-installments.util.ts`: due comportamenti non ovvi

```ts
export function installmentAmountText(money: Money): string {
  return moneyToDecimalString(money).replace('.', ',');
}

export function serializeInstallments(
  values: readonly InstallmentFormValue[],
  currency: CurrencyCode,
): SerializeInstallmentsResult {
  const installments: SerializedInstallment[] = [];
  for (const [index, installment] of values.entries()) {
    const hasContent =
      installment.dueDate.trim() || installment.amountText.trim() || installment.settled;
    if (!hasContent) continue;
    const amount = parseMoneyInput(installment.amountText, currency);
    if (!installment.dueDate || amount === null || amount.amountMinor < 0) {
      return {
        ok: false,
        message: `Scadenza ${index + 1}: inserisci data scadenza e importo validi.`,
      };
    }
    installments.push({
      dueDate: new Date(installment.dueDate).toISOString(),
      amountMinor: amount.amountMinor,
      settled: installment.settled,
      settledAt: installment.settledAt ? new Date(installment.settledAt).toISOString() : undefined,
    });
  }
  return { ok: true, installments };
}
```

Due vincoli non ovvi: (1) una rata a **zero** salvata deve rientrare come «0,00» e non vuota, altrimenti diventa «incompleta» e blocca il salvataggio successivo. (2) Una riga a metà (data senza importo o viceversa) **non si completa d'ufficio** — blocca la submit nominando l'indice.

**Adattamento: nessuno di sostanza** — è un'estrazione 1:1 di codice che `develop` già possiede inline in `purchase-invoice-form.component.ts` (righe ~838-851, ~1042-1070, ~1266-1275, non cambiato dal punto di divergenza). Riportare anche lo spec (105 righe, 5 casi).

**Verdetto: da riportare.**

### C.6 — `DocumentInstallmentDto`: non ricreare, è già gemella

`create-document.dto.ts` e `update-document.dto.ts` di `develop` **non hanno** `installments`, ma esiste già una classe identica campo per campo: `PurchaseInvoiceInstallmentDto` (`save-purchase-invoice.dto.ts:43`).

**Verdetto: da riportare adattando** — riusare la classe esistente o spostarla in un file condiviso, **non ricrearla**.

### C.7 — `CreateDocumentBody`: dichiarare i campi che già viaggiano senza tipo

**Difetto verificato, indipendente dalle rate.** `sales-document-form.component.ts:2110-2115` di `develop` invia già `paymentDueDate`, `iban`, `linkedSalesDdtIds` dentro uno spread condizionale — che **non attiva** il controllo TypeScript sulle proprietà in eccesso. Il body è già più largo del suo tipo dichiarato, e nessuno se ne accorge.

**Verdetto: da riportare** — dichiarare i quattro campi in `CreateDocumentBody`.

### C.8 — Campo «Modalità di pagamento» in testata

Manca del tutto sulla maschera di vendita. Tutto il resto esiste già: `PaymentOptionsService`, il seed coi nomi che portano il codice, `customer.paymentMethod`. Il computed è quasi identico a quello già presente in `goods-receipt-form.component.ts:602-613` — **non copiarlo una terza volta**, è la soglia oltre cui `regole-architettura` rende l'estrazione obbligatoria (due usi reali + uno nuovo).

**Verdetto: da riportare adattando** — come helper condiviso, non come terza copia.

### C.9 — Cosa NON serve rifare

Il percorso di **lettura** delle rate è già generico in `develop`: query, `DocumentDetail`, mapper, modello frontend — nessun gate sul tipo documento, nessuna migration necessaria.

**Buco aperto sia sul ramo sia su `develop`, da notare**: la stampa PDF (`document-pdf.service.ts:319-348`) e l'anteprima (`document-print-preview.component.ts:218`) mostrano scadenze e residuo **solo per la fattura fornitore**. Una fattura di vendita con rate le avrebbe a video ma non in stampa.

---

## §D — Nota di credito (`credit_note`, TD04)

**Verdetto d'insieme.** La Nota di credito del ramo è una feature piccola e ben cucita — circa 25 punti d'innesto, quasi tutti da una a cinque righe, senza entità nuove. Ma il ramo è del 7/08 e `develop` ha 231 commit in più: **due terzi del valore va riportato adattando, non copiando**, e la parte più pericolosa è una cosa che sul ramo **non c'è affatto**.

### D.0 — ⚠️ Il pezzo che nessun diff mostra, ed è il più importante

Il ramo, nato quando l'indice unico sui numeri documento era `(tenant_id, type, series, number)` a colonne semplici, non aveva motivo di toccarlo. Su `develop` quell'indice è stato riscritto l'11/08 come **indice di espressione** con un `CASE`, e la sua migration avverte per iscritto: «Se un domani un altro tipo dovesse condividere il numeratore, va aggiunto QUI oltre che in `documentNumberingType`».

**Aggiungere `credit_note` al solo `documentNumberingType` — che è ciò che il diff del ramo suggerisce — riapre esattamente il difetto che quella migration chiude: due documenti fiscali con lo stesso numero.** Nessuna compilazione protesta, nessun test arrossisce.

```sql
-- migration NUOVA (successiva a quella dell'enum — vedi vincolo sotto), da scrivere a mano:
DROP INDEX IF EXISTS "documents_number_unique";

CREATE UNIQUE INDEX "documents_number_unique"
  ON "documents" (
    "tenant_id",
    (
      CASE
        WHEN "type" IN ('invoice_accompanying'::"DocumentType", 'credit_note'::"DocumentType")
          THEN 'invoice_draft'::"DocumentType"
        ELSE "type"
      END
    ),
    "series",
    "number"
  )
  NULLS NOT DISTINCT
  WHERE "number" IS NOT NULL;
```

**Verdetto: da riportare adattando** — il ramo non contiene questo pezzo, va scritto da capo.

### D.1 — Migration dell'enum: riusabile identica

```sql
-- Nota di credito di vendita (TD04): nuovo tipo documento fiscale.
-- Condivide il numeratore con le fatture (documentNumberingType, come
-- l'accompagnatoria) e non muove mai il magazzino. Nessuna tabella nuova:
-- niente RLS da abilitare.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'credit_note';
```

**⚠️ Va tenuta in un file di migration DA SOLA**: PostgreSQL non permette di **usare** un valore enum nella stessa transazione in cui lo si aggiunge. L'indice di D.0, che nomina `'credit_note'::"DocumentType"`, deve stare in una **seconda** migration — altrimenti `npm run prisma:deploy` fallisce con «unsafe use of new value of enum type».

**Verdetto: da riportare, identico.**

### D.2 — Il bug del progressivo duplicato: **già corretto in `develop`, meglio**

Il ramo aveva `documentNumberingTypeSet()` usata in un punto. `develop` ha `documentNumberingTypes()` (plurale) usata in **tre** — aggregato Prisma, SQL grezzo del «primo libero», conteggi dei contatori — più advisory lock transazionale, indice di espressione, e la regola «primo libero dopo i documenti di data anteriore».

```ts
// RAMO (superato): NON riportare
export function documentNumberingTypeSet(type: DocumentType): readonly DocumentType[] {
  return documentNumberingType(type) === DocumentType.invoice_draft
    ? SALES_INVOICE_DOCUMENT_TYPES
    : [type];
}

// DEVELOP (da estendere, non da sostituire) — document-type.util.ts
export function documentNumberingTypes(type: DocumentType): readonly DocumentType[] {
  const owner = documentNumberingType(type);
  if (owner === DocumentType.invoice_draft) {
    return [DocumentType.invoice_draft, DocumentType.invoice_accompanying];
  }
  return [owner];
}
```

**Non riportare la funzione del ramo.** Si aggiunge `DocumentType.credit_note` all'array dentro `documentNumberingTypes` di `develop` — **attenzione: quell'array è scritto a mano e non deriva da `SALES_INVOICE_DOCUMENT_TYPES`**, estendere la costante non basta.

**Verdetto: già presente in develop.**

### D.3 — `documentNumberingType`: la NC numera sotto la Fattura, in DUE file

```ts
// api/src/documents/document-type.util.ts
export function documentNumberingType(type: DocumentType): DocumentType {
  return type === DocumentType.invoice_accompanying || type === DocumentType.credit_note
    ? DocumentType.invoice_draft
    : type;
}

// src/app/domain/documents/models/document-numbering.util.ts (specchio FE, NATO DOPO il ramo)
export function documentNumberingType(type: DocumentType): DocumentType {
  return type === DocumentType.InvoiceAccompanying || type === DocumentType.CreditNote
    ? DocumentType.InvoiceDraft
    : type;
}
```

⚠️ **Il ramo tocca solo il file API.** Lo specchio frontend è nato dopo (commit `53fad62d`) e va aggiornato **insieme** — altrimenti il pannello Numerazioni aperto da una Nota di credito filtra su `counter.type === 'credit_note'` e mostra zero righe.

**Verdetto: da riportare adattando.**

### D.4 — §7 della specifica `07`: già chiuso in `develop`

`available()` (`document-counters.service.ts`) e il pannello Numerazioni (`document-series-manager-dialog.component.ts`) già usano `documentNumberingType`, con un commento che descrive esattamente il difetto che la specifica `07` §7 temeva. La specifica dice «non iniziato»: **è superata dai fatti**.

**Verdetto: già presente in develop.**

### D.5 — Famiglia permessi `invoice`: **obbligatoria**, il ramo non la conosce

`develop` ha introdotto **dopo** il 6/08 una matrice permessi per famiglia documento. `documentFamilyOf()` **lancia un'eccezione** su un tipo non mappato — senza questa riga la Nota di credito fa esplodere ogni lettura.

```ts
// api/src/auth/document-permission.util.ts
invoice: [DocumentType.invoice_draft, DocumentType.invoice_accompanying, DocumentType.credit_note],

// src/app/core/permissions/document-permission.util.ts
invoice: [DocumentType.InvoiceDraft, DocumentType.InvoiceAccompanying, DocumentType.CreditNote],
```

La guardia `npm run check:permissions` confronta i due file e fallisce se divergono. **Interamente nuovo**: il ramo precede il sistema permessi e usa ancora `TenantPermission.DocumentsManage` nelle rotte — ogni rotta e voce hub va riscritta con `familyManage('invoice')` / `familyView('invoice')`.

**Verdetto: da riportare adattando** — è la prima riga da scrivere, non l'ultima.

### D.6 — `SALES_INVOICE_DOCUMENT_TYPES`, `NON_STOCK_DOCUMENT_TYPES`

```ts
// document.model.ts
CreditNote: 'credit_note',

// document-type.util.ts — NON_STOCK_DOCUMENT_TYPES
export const NON_STOCK_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.proforma,
  DocumentType.invoice_draft,
  DocumentType.supplier_order,
  DocumentType.supplier_invoice,
  DocumentType.quote,
  // Nota di credito: rettifica contabile; il rientro fisico passa da un
  // documento di carico separato (Arrivo merce).
  DocumentType.credit_note,
] as const;
```

⚠️ Il commento originale del ramo diceva «il rientro fisico è dello `store_return`»: **la specifica `07` §6 ha misurato che è falso** — il Reso vendita negozio accetta solo origine `store_sale`, nessun `customerId`, nasce solo dalla cassa. Un cliente fatturato che rende merce non ha oggi quella strada. Il commento va riscritto come sopra.

**Il ramo l'ha messo esattamente nel file e nella lista giusti — sette giorni prima che la specifica lo scrivesse.**

**Verdetto: da riportare** (col commento corretto).

### D.7 — «Genera nota di credito»: conversione da fattura emessa

```ts
// document-type.util.ts
/**
 * Tipi generabili da una fattura emessa: la sola Nota di credito. La NC nasce
 * sempre come rettifica di una fattura, mai il contrario.
 */
export const INVOICE_CONVERT_TARGET_TYPES: readonly DocumentType[] = [
  DocumentType.credit_note,
] as const;
export function isInvoiceConvertTarget(type: DocumentType): boolean {
  return (INVOICE_CONVERT_TARGET_TYPES as readonly string[]).includes(type);
}

// documents.service.ts — buildConversionDto
const isInvoiceSource =
  isSalesInvoiceDocumentType(source.type) && source.type !== DocumentType.credit_note;
if (!isProformaSource && !isSalesDdtSource && !isInvoiceSource) {
  throw new ConflictException(
    'Solo proforme, DDT vendita e fatture possono essere convertiti con questa azione.',
  );
}
if (isInvoiceSource && !isInvoiceConvertTarget(dto.targetType)) {
  throw new UnprocessableEntityException('Da una fattura si può generare solo la Nota di credito.');
}
```

`develop` oggi ammette **solo** `proforma` e `sales_ddt` come origine di conversione. Il vincolo «mai da un'altra NC» evita la nota di credito della nota di credito.

**Verdetto: da riportare.**

### D.8 — ⚠️ Il Codice IVA di riga non sopravvive al prefill — difetto vivo in DUE punti

**Il più grave dei difetti trasversali.** Senza questo, il salvataggio risolve il **default articolo/tenant** e sovrascrive aliquota e **Natura**. Su una nota di credito è fatale: la rettifica deve portare l'IVA della fattura che sta rettificando, non quella che l'articolo avrebbe **oggi**.

```ts
// api/src/documents/documents.service.ts — dentro lines.map di buildConversionDto
// Il Codice IVA viaggia col prefill: senza, il salvataggio risolverebbe
// il default articolo/tenant sovrascrivendo aliquota e Natura — su una
// nota di credito la rettifica deve usare l'IVA della fattura d'origine.
vatCodeId: line.vatCodeId ?? undefined,
```

**Verificato: il difetto è vivo in entrambi i punti su `develop` oggi.** API: `buildConversionDto` mappa le righe **senza** `vatCodeId`. Frontend: il prefill fa `vatCodeId: ''` — azzeramento esplicito.

**Adattamento frontend**: il blocco `this.fb.control(...)` scritto a mano che il ramo modificava è stato sostituito da `develop` con `createLine() + patchValue`. La correzione su `develop` è una parola: `vatCodeId: ''` → `vatCodeId: line.vatCodeId ?? ''`.

**Verdetto: da riportare adattando** — priorità alta, vale anche per proforma→fattura e DDT→fattura, non solo per la NC.

### D.9 — XML: TD04 e `DatiFattureCollegate`

```ts
// fatturapa-xml.util.ts — input
/** Fatture rettificate da una nota di credito (blocco DatiFattureCollegate). */
readonly linkedInvoices?: readonly { readonly reference: string; readonly date: Date }[];

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

// document-xml.service.ts
const isCreditNote = document.type === DocumentType.credit_note;
const sourceRef = document.sourceDocument;
const linkedInvoices =
  isCreditNote && sourceRef && isSalesInvoiceDocumentType(sourceRef.type) && sourceRef.reference
    ? await this.prisma.document
        .findFirst({ where: { id: sourceRef.id, tenantId }, select: { documentDate: true } })
        .then((source) =>
          source ? [{ reference: sourceRef.reference as string, date: source.documentDate }] : [],
        )
    : [];
// documentTypeCode: isCreditNote ? 'TD04' : 'TD01'
```

**Cosa afferma il ramo (da verificare).** `DatiFattureCollegate` (2.1.6) nello schema **precederebbe** `DatiDDT` (2.1.8) — l'ordine sarebbe vincolante nell'XSD.

Tecnicamente già compatibile con `develop`: `DocumentDetail.sourceDocument` esiste ed è tenant-scoped. Da rifare solo l'innesto, perché `develop` ha nel frattempo aggiunto `issuerDetails` (regime fiscale, §E).

**Nota fiscale dedotta e non verificata** (lo dice la specifica `07` §6 stessa): verso lo SdI la TD04 dovrebbe portare importi positivi — coerente con questo modello, ma non verificato su questo repository.

**Verdetto: da riportare adattando** — la specifica `07` §9 mette l'XML/SDI fuori dal perimetro attuale: il pezzo si conserva, non necessariamente si esegue subito.

### D.10 — Registro commercialista: la NC entra nel ciclo «Da emettere → Inviata»

```ts
// accountant-document-types.constant.ts
export const ACCOUNTANT_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.sales_ddt,
  DocumentType.invoice_draft,
  DocumentType.credit_note,
  DocumentType.goods_receipt,
  DocumentType.supplier_invoice,
] as const;

// accountant-register-document-counts.util.ts
const INVOICE_REGISTER_TYPES = [DocumentType.invoice_draft, DocumentType.credit_note] as const;
```

`develop` oggi ha i quattro `COUNT(*) FILTER` ancora sull'uguaglianza `d.type = invoice_draft`.

**Da chiedere a Luigi, non decidere da soli**: se nella stessa lista debba entrare anche `invoice_accompanying`, che oggi manca da entrambi i file — il ramo non se l'è posta.

**Verdetto: da riportare.**

### D.11 — Pulsante «Genera nota di credito» sul dettaglio

```ts
/** «Genera nota di credito»: da una fattura emessa, mai da un'altra NC. */
protected readonly canGenerateCreditNote = computed(() => {
  const doc = this.document();
  return (
    this.canManage() &&
    doc != null &&
    isSalesInvoiceDocumentType(doc.type) &&
    !isCreditNoteDocumentType(doc.type) &&
    doc.status !== DocumentStatus.Cancelled &&
    doc.status !== DocumentStatus.Draft
  );
});
```

Il markup va rimesso in **entrambi** i template (`document-detail.component.html` e `sales-document-detail.component.html`), perché `SalesDocumentDetailComponent` estende la logica ma non il markup. `canManage()` deve passare per `familyManage('invoice')`, non più `DocumentsManage`.

**Verdetto: da riportare adattando.**

### D.12 — La NC non aggancia DDT

```ts
/** Nota di credito (TD04): rettifica una fattura, mai riferimenti DDT propri. */
protected readonly isCreditNote = computed(() => this.documentType() === DocumentType.CreditNote);

/** Pannello «Riferimento DDT»: fatture sì, nota di credito no. */
protected readonly showDdtPanel = computed(() => this.isSalesInvoice() && !this.isCreditNote());
```

**Verdetto: da riportare** — l'innesto è pulito, attenzione solo alla sintassi del binding sul titolo del pannello mobile (`title=` → `[title]=`).

### D.13 — Il contorno: rotta, hub, elenco, breadcrumb, etichette, stampa

Tutte le strutture esistono con due tipi su `develop`. **Tre adattamenti obbligatori**: (1) permessi di famiglia invece di `DocumentsManage`; (2) `PRINTABLE_DOCUMENT_TYPES` **non esiste più** su `develop` — sostituito da Record esaustivi (`HAS_PRINTED_SHEET`, `PRINT_KIND`, `FISCAL_DISCLAIMER`) confrontati dalla guardia `check:print-types`; (3) il sottotitolo dell'elenco va riscritto (la specifica `07` §3 lo chiede, il ramo non lo fa).

**Verdetto: da riportare adattando.**

### D.14 — Due sviste del ramo, da NON ricopiare

```ts
// DIFETTO 1 — ramo: il case c'è, la voce di menu no. Ramo morto.
//   … { value: 'invoice-accompanying', label: 'Fattura accompagnatoria' },
//   ]   ← nessuna voce 'credit-note'
// ma nello switch:
      case 'credit-note':
        this.openNewInvoice(DocumentType.CreditNote);
        break;

// DIFETTO 2 — voce hub senza `family`: su develop la famiglia serve al filtro permessi.
```

### D.15 — Domanda aperta della specifica §6: risposta misurata, NO

`includeSourceKindsForDocumentType(type)` restituisce `[]` per tutto tranne il DDT vendita — **l'inclusione documenti non copre il caso e non ci va vicino.** La strada giusta è la conversione (D.7), che il ramo aveva già scelto senza dichiararlo.

**Verdetto: già presente in develop** (come risposta) — da riportare nella specifica come punto chiuso.

### D.16 — ⚠️ La specifica `07` §6 si contraddice — da segnalare a Luigi

Il ⚠️ in testa a «Il magazzino» dice che la NC non movimenta il magazzino e non ha la casella; la sottosezione successiva parla ancora di «aggiungere il ramo di carico della nota di credito» e lascia aperto `StockMovementType.return`. Sono residui del ragionamento precedente alla decisione del 14/08: **vanno cancellati o marcati come superati**, o chi esegue implementerà un carico che nessuno vuole.

Di conseguenza lo sganciamento di `DEDICATED_WORKFLOW_DOCUMENT_TYPES` **non è più un prerequisito** — resta una pulizia sensata in sé (l'alias afferma implicitamente «ogni tipo che carica ha una maschera dedicata»), ma non blocca nulla.

### D.17 — DIVERGENTE dalla specifica `07` §4: percorsi separati solo per la creazione

Il ramo aggiunge la sola rotta `nota-credito/new`. Una nota **esistente** aprirebbe sul percorso generico, dove `documentType()` ricade su Proforma finché il documento non è caricato — **verificato vivo in `develop` oggi**, stesso difetto che la `07` §4 (sette giorni dopo il ramo) vuole chiudere per tutti e tre i tipi.

**Il lavoro di §4 è più grande della sola Nota di credito**: servono rotte di apertura/modifica per tipo per tutti e tre. **Da decidere se farlo insieme alla NC o come lavoro a sé** — farlo a metà lascia il terzo tipo nella condizione già misurata e visibile a schermo.

### D.18 — DIVERGENTE dalla specifica `07` §5: la tendina a tre voci non c'è

Il ramo aggiunge una `createVariant`, ma lascia il pulsante «Nuovo» legato al filtro Tipo attivo — che è **esattamente** «il legame da sciogliere» che la specifica chiede di rompere.

**Verdetto: da riportare adattando** — la `createVariant` si riporta identica, il resto (split-button, sciogliere `salesCreateLabel` dal filtro) è lavoro nuovo.

### D.19 — Test del ramo su `document-type.util`

```ts
it('la nota di credito è una fattura di vendita senza magazzino', () => {
  expect(isSalesInvoiceDocumentType(DocumentType.credit_note)).toBe(true);
  expect(documentTypeDefaultLoadsStock(DocumentType.credit_note)).toBe(false);
});

it("la nota di credito numera sotto invoice_draft, come l'accompagnatoria", () => {
  expect(documentNumberingType(DocumentType.credit_note)).toBe(DocumentType.invoice_draft);
});

it('da una fattura si genera solo la nota di credito', () => {
  expect(isInvoiceConvertTarget(DocumentType.credit_note)).toBe(true);
  expect(isInvoiceConvertTarget(DocumentType.sales_ddt)).toBe(false);
});
```

Il quarto test del ramo va riscritto su `documentNumberingTypes` (nome di `develop`), non `documentNumberingTypeSet`. **Vale la pena aggiungerne uno che nessuno dei due ha**: una prova che l'indice unico e `documentNumberingType` restino d'accordo — è il disallineamento di D.0, e nessun test oggi lo copre.

**Verdetto: da riportare adattando.**

### D.20 — §2 della specifica: l'avviso sul progressivo condiviso — assente da entrambi

Lavoro nuovo, non recuperabile dal ramo. La specifica chiede anche l'**equivalente mobile** (tocco sull'icona o riga sotto il campo, non solo hover) — senza, l'informazione la vede metà degli operatori.

---

## §E — Regime fiscale del cedente (RF01-RF19)

**La decisione di scartare regge, e più di quanto si pensasse**: `develop` non solo ha la propria implementazione, è **più avanti** del ramo su quasi tutta l'area — 18 codici sul backend, 18 etichette sul frontend (con la norma citata su RF19, che il ramo non aveva), validazione, schermata viva in Impostazioni → Dati azienda, scrittura XML, e due test che la coprono (incluso `expect(xml).not.toContain('RF01')`, la guardia esatta contro il ritorno del valore cablato).

**La migration del ramo (`20260807010000_tenant_tax_regime`, su `tenants`) resta da NON riusare** — confermato di nuovo qui.

### E.1 — L'unica cosa di sostanza da recuperare: la nota su RF03

`git grep RF03 origin/develop` è **vuoto** in tutto il repository. RF03 («Nuove iniziative produttive», art. 13 L. 388/2000) non esiste più nello standard — senza la nota, il salto RF02→RF04 nell'elenco sembra una svista da «completare», invitando all'errore.

```ts
/**
 * Regimi fiscali FatturaPA (RegimeFiscale, specifiche tecniche SDI).
 * RF03 non esiste più nello standard: non va reintrodotto.
 */
```

Da aggiungere in testa a `api/src/common/company/tax-regime.constants.ts` e `src/app/domain/tenant/models/tax-regime.model.ts`.

**Verdetto: da riportare** — solo il commento, i codici `develop` li ha già identici.

### E.2 — `escapeXml` mancante su `<RegimeFiscale>` — l'unico guasto reale, non una pulizia

**Cosa fa il codice, verificato.** `fatturapa-xml.util.ts:322` di `develop` interpola grezzo: `` `<RegimeFiscale>${issuerDetails.taxRegime?.trim() || 'RF01'}</RegimeFiscale>` ``. `escapeXml` esiste nello stesso file ed è usato su PEC e dentro `tag()`, ma non qui.

**Perché non è teorico**: il valore arriva da `company_profiles.tax_regime`, colonna TEXT libera, e il **ripristino da backup** (`tenant-backup-import.service.ts`, `createEntityRows`) scrive le righe del file fornito dal cliente **senza passare dal DTO validato** — sovrascrive solo `tenantId`. Un `tax_regime` con `<` o `&` produce un XML malformato che lo SdI scarta senza dire perché.

**Verdetto: da riportare adattando** — cambia solo il nome della sorgente (`issuerDetails.taxRegime` invece di `input.cedente.taxRegime`).

### E.3 — Costante `DEFAULT_TAX_REGIME`: esiste, ma non è importata dove serve

`develop` ha già `DEFAULT_TAX_REGIME` in `tax-regime.constants.ts` con il commento giusto, ma `fatturapa-xml.util.ts:322` scrive `'RF01'` inline invece di importarla. Stessa riga di E.2, stesso passaggio.

**Verdetto: da riportare adattando.**

### E.4 — Messaggio esplicito sulla validazione

```ts
@IsIn(TAX_REGIME_CODES, { message: 'Regime fiscale non valido: usa un codice RF01–RF19' })
```

Va sul DTO di `develop` (`company-profile.dto.ts`), non su quello admin del ramo. Cosmetico — prenderlo solo se si tocca comunque quel file.

### E.5 — `taxRegimeDisplayLabel()`: NON portare ora

Su `develop` oggi sarebbe codice morto — nessuna schermata mostra il regime in sola lettura. Se e quando nasce un riepilogo azienda, va **riscritta** (le etichette di `develop` portano già il codice davanti, la concatenazione del ramo produrrebbe «RF19 — RF19 — Forfettario»). **La regola da conservare, non la funzione**: non mostrare la riga quando il valore è NULL o RF01.

### E.6 — Osservazione dal confronto, non dal ramo: candidato, non mandato

Nella select di `develop`, RF01 compare **due volte**: come opzione vuota e come prima voce dell'elenco. Producono lo stesso XML ma persistono valori diversi (NULL vs 'RF01') — la maschera si riapre mostrando una o l'altra a seconda di quale si è scelta. Non rompe niente, potrebbe essere voluto. **Da decidere, non correggere d'ufficio.**

---

## §F — I difetti ricostruiti: 20, non 14

**Onestà sul metodo.** Il messaggio di commit dichiara «14 difetti confermati» ma non li elenca, e il ramo non ha un file di revisione. Ho ricostruito i candidati leggendo il diff completo (4148 righe) e isolando ogni correzione che tocca codice **preesistente** al punto di divergenza, poi verificando ognuno su `develop` con `git show`. **Ne sono emersi 20, non 14** — alcuni sono probabilmente sotto-parti di un solo finding originale, altri potrebbero non essere stati contati fra i 14. Non è una mappatura 1:1.

**17 su 20 sono verificati ancora vivi su `develop` oggi.** 3 `develop` li ha già corretti per conto suo — e meglio del ramo: vanno ignorati, non riportati.

**Quadro**: l'export XML di `develop` è, oggi, **non trasmissibile**. Sette difetti indipendenti lo colpiscono (Natura mai emessa, PrezzoUnitario troncato, PEC con codice reale, DatiPagamento senza modalità, sconto testata non ripartito, ImportoTotaleDocumento non ricostruibile, ProgressivoInvio oltre limite). Il file lo dichiara in testa: «L'output non è garantito pronto da trasmettere: è una base che il commercialista completa». Il ramo faceva esattamente il salto da quella base al file trasmissibile — è quel salto che va rifatto.

### Vivi su `develop` — alta gravità

| #   | Cosa                                                                    | Dove                                                      | Rif. |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------- | ---- |
| 1   | Natura mai emessa (chiave sbagliata: `natura` invece di `officialCode`) | `document-xml.service.ts:92`                              | A.1  |
| 2   | Sconto testata non ripartito: XML non quadra con sé stesso              | `document-xml.service.ts` (mapper)                        | A.4  |
| 3   | `PrezzoUnitario` troncato al centesimo                                  | `document-xml.service.ts:88`, `fatturapa-xml.util.ts:227` | A.3  |
| 4   | `PECDestinatario` emessa anche con codice destinatario reale            | `fatturapa-xml.util.ts:315`                               | A.6  |
| 5   | `DatiPagamento` senza `ModalitaPagamento`                               | `fatturapa-xml.util.ts:270-282`                           | A.10 |
| 6   | Codice IVA di riga perso nel prefill — lato API                         | `documents.service.ts:2503-2512`                          | D.8  |
| 7   | Codice IVA di riga perso nel prefill — lato frontend                    | `sales-document-form.component.ts:2550`                   | D.8  |

### Vivi su `develop` — gravità media

| #   | Cosa                                                                  | Dove                               | Rif. |
| --- | --------------------------------------------------------------------- | ---------------------------------- | ---- |
| 8   | `DatiRiepilogo` raggruppato per sola aliquota, non (aliquota, Natura) | `document-xml.service.ts:158-178`  | A.2  |
| 9   | `ImportoTotaleDocumento` non ricostruito dai riepiloghi               | `document-xml.service.ts:110`      | A.5  |
| 10  | `ProgressivoInvio` oltre il limite dichiarato                         | `fatturapa-xml.util.ts:312`        | A.7  |
| 11  | Filtro «da saldare» include gli annullati                             | `documents.service.ts:380-381`     | C.2  |
| 12  | Annullamento non azzera `outstandingMinor`                            | `documents.service.ts:2823-2826`   | C.2  |
| 20  | Nessun filtro sui codici Natura in uscita (pseudo-codici interni)     | `document-xml.service.ts` (mapper) | —    |

### Vivi su `develop` — gravità bassa

| #   | Cosa                                                  | Dove                                                | Rif. |
| --- | ----------------------------------------------------- | --------------------------------------------------- | ---- |
| 13  | Rata a zero rientra vuota invece di «0,00»            | `purchase-invoice-form.component.ts:1271,1336-1341` | —    |
| 14  | Nome file SDI oltre il limite dichiarato              | `fatturapa-xml.util.ts:375-380`                     | A.8  |
| 15  | Duplica copia la scadenza di pagamento dell'originale | `sales-document-form.component.ts:2481-2496`        | C.3  |
| 16  | `CreateDocumentBody` non dichiara campi già inviati   | `document-api.mapper.ts`                            | C.7  |

### Già corretti su `develop` — non riportare

| #   | Cosa                                                | Come `develop` l'ha risolto meglio                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 17  | RegimeFiscale cablato a RF01                        | `company_profiles.tax_regime` + REA + snapshot emittente — §E |
| 18  | Progressivo duplicato fra fattura e accompagnatoria | `documentNumberingTypes` in tre punti + advisory lock — D.2   |
| 19  | `PRINTABLE_DOCUMENT_TYPES` divergente API/frontend  | Record esaustivi + guardia `check:print-types`                |

---

## Conoscenza di dominio da non perdere — riepilogo copiabile

Le formule e le tabelle che costano fatica a riscrivere, in un solo posto:

1. **`PrezzoUnitario`** — §A.3, funzione `unitPrice()`.
2. **Ripartizione sconto testata** — §A.4, funzione `applyDocumentDiscount()`, con la nota sui confini `.5` e sul residuo.
3. **Natura da `officialCode`** — §A.1, `NATURA_PATTERN` e `naturaFromSnapshot()`.
4. **`DatiRiepilogo` per (aliquota, Natura)** — §A.2.
5. **`PECDestinatario` condizionata** — §A.6.
6. **`ProgressivoInvio` e nome file, limiti** — §A.7, §A.8 (**da rileggere insieme a `docs/04` §11** prima di implementare).
7. **`sdiPaymentMethodCode()`** — §A.9, riusabile identica.
8. **Checksum P.IVA e codice fiscale** — §B.1, §B.2. La tabella `CF_ODD_VALUES` **non è derivabile**, va copiata.
9. **Regola RF03** — §E.1.
10. **Nota di credito**: numeratore condiviso (D.2, D.3), non movimenta magazzino (D.6), nasce solo da fattura emessa (D.7), `DatiFattureCollegate` precede `DatiDDT` (D.9), entra nel registro commercialista (D.10).
11. **Il pezzo che nessun diff mostra**: l'indice unico va ricostruito a mano, in una migration separata da quella dell'enum — §D.0.

---

## §G — Da verificare su fonte ufficiale prima di implementare

Ogni riga qui sotto è un'affermazione **del ramo**, non verificata da questa estrazione contro una fonte ufficiale. Verificarle **solo quelle che servono**, quando si arriva a implementarle — non tutte in anticipo.

- **Controllo 00400** — Natura obbligatoria quando l'aliquota è 0% (§A.1).
- **Controllo 00422** — quadratura sconto testata / riepiloghi (§A.4).
- **Controllo 00423** — `PrezzoUnitario × Quantità` deve tornare col `PrezzoTotale`; fino a 8 decimali ammessi (§A.3).
- **Controllo 00426** — `PECDestinatario` ammessa solo con `CodiceDestinatario = 0000000` (§A.6).
- **Controllo 00427** — codice PA a 6 caratteri scartato da FPR12 (§B.4).
- **`ProgressivoInvio`** — tipo `String10Type`, max 10 caratteri (§A.7).
- **Nome file SDI** — progressivo max 5 caratteri dopo l'identificativo fiscale (§A.8).
- **`ModalitaPagamento`** — obbligatoria dentro ogni `DettaglioPagamento`; tabella MP01-MP23 (§A.10, §A.9).
- **`DatiFattureCollegate`** — precede `DatiDDT` nello schema, ordine vincolante (§D.9).
- **TD04 con importi positivi** — già segnata _dedotta, non verificata_ dalla specifica `07` §6 stessa (§D.9).
- **Checksum P.IVA** — «Luhn art. 35 DPR 633/72» (§B.1). L'algoritmo è verificabile con vettori di prova indipendenti; i vettori del ramo (§B.7) sono un punto di partenza, non una prova di per sé.
- **Checksum codice fiscale** — tabella «DM 12/03/1974» (§B.2). Stessa nota.
- **Elenco RF01-RF19, esclusione RF03** — tabella `RegimeFiscale` del tracciato (§E.1). Qui `develop` ha già una fonte indipendente che concorda col ramo su tutti i 18 codici: è il segnale più forte a favore, ma resta una verifica incrociata fra due fonti non ufficiali, non una verifica su fonte ufficiale.

**Dove verificare**: Elenco dei controlli ufficiale e specifiche tecniche del tracciato FatturaPA in vigore su `fatturapa.gov.it`. La versione conta — un controllo può cambiare fra revisioni del tracciato, e non si sa con certezza quale versione avesse in mano chi ha scritto il ramo il 7 agosto.
