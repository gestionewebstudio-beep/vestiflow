> **Stato:** ⭐ **approvato con correzioni — implementabile.**
> **Verifica integrale:** 24/08/2026, dal proprietario.
> **Famiglia:** `03` specifica normativa · `03b` mappa tecnica · **`03c` questo contratto**
>
> **Sopra questo documento stanno**, e in caso di contrasto prevalgono:
> `docs/03-specifica-unificazione-righe-documento.md` (normativa) e
> `docs/CONTRATTO-COMUNE-DOCUMENTI.md` (Blocco 0 canonico).

---

## Le dieci correzioni applicate dopo la verifica — 24/08/2026

⚠️ **Il corpo NON è più l'uscita integrale**: la prima stesura è nella storia di
git (commit `e55cdfa6`). Queste sono le correzioni che il proprietario ha
chiesto prima di dare via libera, e le due più importanti riguardano difetti che
il contratto si portava dentro.

|          | Cosa cambia                                                                                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** ⛔ | `movimentaMagazzino` → **`gestisceMagazzino`**. Il contratto diceva «una sola spunta con tre nomi», e contraddiceva `03` §18.4 e Blocco 0 §6.2. La **regola di eleggibilità è una sola**; Impegna, Carica e Scarica restano **tre effetti distinti**, mappati dal consumer |
| **2** ⛔ | `titolo` → **`nomeProdotto`**, senza ripiego su `title`. Il contratto dichiarava che `title` contiene la variante e poi lo usava come ripiego: a nome vuoto **la variante sarebbe rientrata nel nome**, cioè il difetto che questo lavoro elimina                          |
| **3**    | **`campi` è la capacità EFFETTIVA**: profilo + feature gate del tenant + permessi. Non un insieme statico                                                                                                                                                                  |
| **4**    | **Seriali fuori**: il Blocco 0 tiene il modello aperto e `03` §5.3 rinvia il loro contratto                                                                                                                                                                                |
| **5**    | **Costo canonico**: numerico sempre, zero compreso. Mascherato dai permessi → **campo assente**, mai un `null` che lo cancella                                                                                                                                             |
| **6**    | **Nessun default U.M. di tenant**: `03` §13 dice che viene dall'articolo. Se manca, stringa vuota                                                                                                                                                                          |
| **7**    | **T7 alla precisione reale**: `2049.1803` di `toStorableMinor`, non `2049.180328`                                                                                                                                                                                          |
| **8**    | **T1 sull'intersezione** dei campi comuni, più presenza/assenza dei campi specifici: pretenderli tutti ovunque contraddirebbe P2                                                                                                                                           |
| **9**    | Via **«Bozza fattura»**: non è nel perimetro di `03` §2                                                                                                                                                                                                                    |
| **10**   | Primo consumer: **Trasferimento**, non Rettifica — che `03` §25 rinvia al suo blocco                                                                                                                                                                                       |

**Approvato senza modifiche**: `famigliaIva`, resolver puro, guscio asincrono
senza risultati parziali, acquisizione fuori, `FormControl` fuori, `variantLabel`
separato dal nome, IVA prima del valore economico, letture vive separate dagli
snapshot, reset uniforme, quantità fuori, sconto digitato preservato.

---

## ⭐ Due confini che valgono su tutto il documento

### 1 · L'anagrafica si legge, non si scrive

```text
anagrafica  →  resolver  →  valori iniziali della riga        SEMPRE
riga        →  Product / ProductVariant                        SOLO Arrivo merce,
                                                               e solo se le sue
                                                               spunte lo autorizzano
```

> **Il resolver può LEGGERE e restituire anche i valori anagrafici che servono
> all'Arrivo merce — prezzo di vendita, prezzo Shopify, prezzo barrato — ma non
> scrive MAI nell'anagrafica.**

⚠️ Non è formale: se il resolver potesse scrivere, **ogni documento che lo usa
erediterebbe quella facoltà**, e «scelgo un articolo» diventerebbe una modifica
del catalogo su sei maschere che non devono poterla fare.

### 2 · Numerazione e serie non lo riguardano

> **Il resolver non tocca numero, serie, contatori né riferimento del documento.**

Sono dati di **testata**, con un motore e una specifica propri (`04`, e §9 del
Blocco 0), e il gesto «un articolo entra nella riga» non li sfiora. Non compaiono
in `CampoArticolo`, non compaiono nell'uscita, e non devono comparirci.

---

## Le quattro domande aperte, chiuse il 24/08/2026

| Domanda                                                | Decisione                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Barcode: snapshot o vivo?**                          | ⏸ **resta aperta**. Il resolver lo produce comunque; la persistenza di ogni payload resta com'è                                                               |
| **Un Servizio ha senso su Trasferimento e Rettifica?** | **Non si decide nel resolver.** L'eleggibilità a magazzino è comune; se un Servizio sia _ammissibile_ su quei documenti è un'altra policy, di quelle maschere |
| **Default U.M. di tenant**                             | **Non si introduce.** Default dall'articolo; se manca, stringa vuota (correzione 6)                                                                           |
| **Storico di `variantLabel`**                          | **Nessuna retro-compilazione** sui dati di sviluppo: si garantisce la correttezza delle righe nuove                                                           |

---

# CONTRATTO DEL RISOLUTORE COMUNE — "un articolo entra nella riga"

---

## 1. LE POLICY CHE SERVONO DAVVERO

Ho confrontato le sette maschere campo per campo. **Le differenze con una ragione di dominio sono DUE.** Tutto il resto è divergenza per storia, e diventa uniformità o contesto. Elenco prima le due, poi — per esteso — le undici che ho rifiutato di promuovere, perché quella lista è la parte che impedisce al risolutore di ricominciare a divergere.

### P1 — `famigliaIva: 'vendita' | 'acquisto' | 'nessuna'`

| Valore     | Catena                                                      | Filtro sui codici               |
| ---------- | ----------------------------------------------------------- | ------------------------------- |
| `vendita`  | articolo → predefinito aziendale                            | `isActive && isSalesVatCode`    |
| `acquisto` | articolo → **fornitore di testata** → predefinito aziendale | `isActive && isPurchaseVatCode` |
| `nessuna`  | non produce nulla                                           | —                               |

**Ragione di dominio.** Non è una preferenza di maschera: sono due famiglie fiscali **disgiunte**, e i due insiemi di codici non si sovrappongono — un codice di vendita su un Ordine fornitore non è "scomodo", è sbagliato. E la famiglia acquisto ha un **anello intermedio che in vendita non esiste**: il fornitore porta un `defaultVatCodeId`, il cliente no (verificato: `applyCustomerDefaults` e `applyCustomerCommercialDefaults` scrivono solo lo sconto, mai l'IVA). Il terzo valore non è "assenza per pigrizia": un trasferimento fra sedi proprie **non ha imponibile**, e produrre un codice IVA lì significa produrre un campo che nessun payload persiste.

Fuori dalla catena resta il **reverse-match sull'aliquota legacy** (`vatRatePercent` → codice con la stessa aliquota) di Arrivo merce e Documenti vendita: non è un anello dell'ingresso articolo, è la migrazione di righe vecchie. Resta nella maschera.

### P2 — `campi: ReadonlySet<CampoArticolo>` (capacità della riga)

Dichiara quali valori la riga di quel documento **sa ospitare**. L'uscita del risolutore è già filtrata su questo insieme: chi lo chiama non deve mai chiedersi se un campo lo riguarda.

**Ragione di dominio.** Non è configurazione: è che i documenti parlano di cose diverse. Un Ordine fornitore non ha giacenza da impegnare perché la merce non c'è ancora; un Trasferimento non ha valore economico perché la proprietà non cambia; solo l'Arrivo merce porta i tre prezzi di vendita, perché è **l'unico documento che scrive all'indietro in anagrafica**.

**Sette maschere, quattro profili.** È il risultato più importante dell'analisi:

| Profilo             | Maschere                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendita`           | Preventivo, Ordine cliente, DDT vendita, Scarico manuale, Proforma, Fattura, Fattura accompagnatoria, Nota di credito, Vendita e Reso al banco |
| `acquisto-ordine`   | Ordine fornitore                                                                                                                               |
| `acquisto-arrivo`   | Arrivo merce                                                                                                                                   |
| `movimento-interno` | Trasferimento interno, Rettifica di magazzino                                                                                                  |

I due profili d'acquisto differiscono per due sole cose (i tre prezzi d'anagrafica e la spunta di carico), e ho scelto di **non** fonderli: fonderli significherebbe produrre su un ordine tre prezzi che nessuno scrive.

### Le undici differenze che ho rifiutato di rendere policy

| Differenza osservata                                                                                                                                                                              | Perché NON è una policy                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Il titolo**: `productName \|\| title` (Ordine cliente, Arrivo merce, Ordine fornitore) · `productName` puro (Doc. vendita) · `title` (Banco) · `productName · title` (Trasferimento, Rettifica) | Nessuna delle quattro forme ha una ragione: sono quattro stesure diverse dello stesso gesto. Due producono la variante dentro il titolo, una la produce **due volte**. Uniformità: `productName`, con `title` come solo ripiego a nome vuoto. |
| **`variantLabel`**: esiste solo sull'Ordine cliente                                                                                                                                               | La variante è un dato della riga ovunque. Uniformità: si produce sempre.                                                                                                                                                                      |
| **Il reset a parità d'articolo** (`replacedArticle` falso ovunque)                                                                                                                                | Deciso dal proprietario: il richiamo resetta sempre. Il predicato `previousVariantId !== value` sparisce, non diventa un valore di policy.                                                                                                    |
| **Quantità a 1 dell'Ordine fornitore** e **azzeramento dello sconto**                                                                                                                             | Il docblock argomenta la quantità («almeno un pezzo lo si vuole») e **tace sullo sconto**. La regola decisa li supera entrambi. Uniformità — e il commento va riscritto insieme al codice, o il prossimo lettore lo ripristina.               |
| **«riscrivi sempre» vs «riempi solo se vuoto»** (i due rami di ogni `applySummaryToLine`)                                                                                                         | È la conseguenza di `replacedArticle`. Sparisce col reset uniforme.                                                                                                                                                                           |
| **Le tre spunte** (carica / scarica / impegna)                                                                                                                                                    | Sono **una sola spunta con tre nomi**: un documento fa al massimo una cosa alla giacenza. La regola sull'articolo è identica per tutte e tre; il nome è UI (`lineStockToggleLabel`, `stockToggleLabel`).                                      |
| **`managesStock` vs `kind`**                                                                                                                                                                      | Nessuno ha scelto: l'uno o l'altro a seconda di chi ha scritto per primo. Uniformità: **entrambi**, con `kind === 'service'` che chiude comunque.                                                                                             |
| **La sorgente del prezzo**: listino (Ordine cliente, Doc. vendita) vs `sellingPrice` (Banco)                                                                                                      | `listinoUnitPrice(articolo, 'article')` **è** `sellingPrice`. Non è una differenza: è un contesto (`listino`) che il Banco riempie con `'article'`.                                                                                           |
| **Il ripiego `'pz'`** cablato in due maschere, `''` in una terza                                                                                                                                  | Un tenant che vende a peso non vuole `'pz'`. È una convenzione di tenant, quindi contesto — e finché non esiste, nessun ripiego (vedi DOMANDA APERTA 3).                                                                                      |
| **Dove atterra l'articolo** e **quanta quantità** (riga corrente · riga con lo stesso variantId + somma · prima riga vuota · riga nuova)                                                          | **Fuori perimetro.** È il livello di _acquisizione_, e la deduplica del Banco (regola A14) è una decisione di prodotto viva. Il risolutore riceve UNA riga e UN articolo: non sceglie la riga e non scrive la quantità.                       |
| **`emitEvent: false`, `updateValueAndValidity`, il fuoco sulla quantità**                                                                                                                         | Fuori perimetro: **il risolutore non scrive nei FormControl**. Restituisce valori; scrive la maschera, come scrive oggi.                                                                                                                      |

---

## 2. LA FIRMA

**Dove vivono i file** (layer `domain`: logica di business usata da più feature — `regole-architettura`):

```
src/app/domain/documents/models/document-line-article.model.ts          tipi, policy, profili
src/app/domain/documents/utils/document-line-article-resolver.util.ts   la funzione PURA
src/app/domain/documents/utils/document-line-article-resolver.util.spec.ts
src/app/domain/documents/services/document-line-article.service.ts      il guscio asincrono
src/app/domain/documents/services/document-line-article.service.spec.ts
```

**Due pezzi, non uno.** Il nucleo è una funzione pura e sincrona: dato il riepilogo, produce i valori. Il guscio procura il riepilogo quando manca. È la divisione che rende il contratto testabile senza mock di rete, e che chiude il difetto più grave dell'ispezione (una riga agganciata e vuota perché il riepilogo non c'era).

```ts
// ── document-line-article.model.ts ──────────────────────────────────────────

/** L'unica policy con una ragione fiscale: due famiglie disgiunte, e un anello
 *  intermedio (il fornitore) che in vendita non esiste. */
export type FamigliaIva = 'vendita' | 'acquisto' | 'nessuna';

/** Cosa la riga di QUESTO documento sa ospitare. Non è una preferenza: è la
 *  forma del documento. L'uscita è già filtrata su questo insieme. */
export type CampoArticolo =
  | 'sku'
  | 'articleCode'
  | 'barcode'
  | 'nomeProdotto' // ⛔ il NOME, mai il display completo: la variante sta a parte
  | 'variantLabel'
  | 'unitaDiMisura'
  | 'codiceIva'
  | 'prezzoUnitario' // valore economico di VENDITA della riga
  | 'costoUnitario' // valore economico di ACQUISTO della riga
  | 'prezzoVenditaAnagrafica' // i tre che l'Arrivo merce LEGGE per scrivere
  | 'prezzoShopifyAnagrafica' //   all'indietro: la scrittura NON è del resolver
  | 'prezzoBarratoAnagrafica'
  | 'gestisceMagazzino' // ⛔ ELEGGIBILITÀ, non una spunta: vedi sotto
  | 'sconto'
  | 'codiceFornitore';

export interface PolicyRichiamoArticolo {
  readonly famigliaIva: FamigliaIva;
  /**
   * ⛔ NON è un insieme statico del profilo: è la capacità **effettiva**.
   *
   *   profilo base  +  feature gate del tenant  +  permessi  =  campi
   *
   * Senza la composizione due cose vanno storte, e nessuna delle due si vede:
   * un tenant senza Shopify riceverebbe un campo che per lui non esiste, e a
   * un utente a cui il costo è mascherato il resolver proporrebbe un valore che
   * non ha il diritto di vedere — o, peggio, un vuoto che glielo cancella.
   */
  readonly campi: ReadonlySet<CampoArticolo>;
}

/** Quattro profili per sette maschere. Record ESAUSTIVO: un tipo documento
 *  nuovo che non dichiara il proprio profilo NON COMPILA — stessa forma di
 *  DOCUMENT_ROW_OPENS. */
export type ProfiloRigaDocumento =
  'vendita' | 'acquisto-ordine' | 'acquisto-arrivo' | 'movimento-interno';

export const DOCUMENT_LINE_ARTICLE_POLICIES: Record<ProfiloRigaDocumento, PolicyRichiamoArticolo> =
  {/* … */};

/** Stato del MONDO al momento del richiamo. Tutto ciò che non viene
 *  dall'articolo e non viene dalla riga. */
export interface ContestoRichiamoArticolo {
  /** 'article' dove non esiste un selettore di listino in testata. */
  readonly listino: ListinoChoice;
  readonly codiciIvaPerId: ReadonlyMap<string, VatCode>;
  /** Codice IVA del FORNITORE di testata. Sempre null in vendita: il cliente
   *  non ne porta uno, e la catena lo salta senza saperlo. */
  readonly codiceIvaControparte: string | null;
  /** Predefinito aziendale GIÀ filtrato sulla famiglia. */
  readonly codiceIvaPredefinito: string | null;
  /** Sconto d'anagrafica della controparte di testata: cliente o fornitore.
   *  La stringa a cascata ('4+10') si passa intatta, mai risolta. */
  readonly scontoControparte: string | null;
  /** Il codice con cui l'aggancio è avvenuto, se era un codice fornitore.
   *  È l'unico modo perché "con quale codice" arrivi fin qui. */
  readonly codiceFornitoreDigitato: string | null;
  /** Il collegamento articolo↔fornitore di testata, dove la maschera lo carica. */
  readonly codiceFornitoreDiTestata: string | null;
}

// ⛔ QUI c'era `unitaDiMisuraPredefinita`, una convenzione di tenant che NON
//    ESISTE. `03` §13 dice che la U.M. di riga prende il default DALL'ARTICOLO,
//    e introdurre adesso un default aziendale significherebbe inventare una
//    regola per risolvere un ripiego. Se l'articolo non la porta, il campo resta
//    vuoto — e se `VariantSummary` non la portasse, si corregge la summary.

/** I valori CORRENTI della riga che il risolutore deve conoscere. Sono tre, e
 *  non uno di più: tutto il resto lo riscrive. */
export interface StatoRigaAlRichiamo {
  readonly variantIdPrecedente: string | null;
  /** Ha già un id lato server. Serve SOLO a segnalare, non a cambiare l'esito. */
  readonly rigaPersistita: boolean;
  /** DIGITATO: se non è vuoto, il risolutore non propone nulla. */
  readonly scontoCorrente: string;
}

/** I campi DA SCRIVERE, già filtrati su policy.campi: una chiave assente
 *  significa "non toccare", mai "svuota". Per svuotare c'è '' o null. */
export interface ValoriArticoloDaScrivere {
  /**
   * Il NOME dell'articolo, canonico e separato dalla variante.
   *
   * ⛔ Nessun ripiego su `title`: il contratto stesso dichiara che `title` è il
   * display completo e **contiene la variante**, quindi `productName || title`
   * rimetterebbe la variante dentro il nome — cioè esattamente il difetto che
   * questo lavoro elimina, riattivato dal caso limite.
   *
   * Se `VariantSummary.productName` non fosse affidabile, si corregge la
   * summary: non si torna a sottrarre stringhe da `title`.
   */
  readonly nomeProdotto?: string;
  readonly variantLabel?: string;
  readonly sku?: string;
  readonly articleCode?: string;
  readonly barcode?: string;
  readonly unitaDiMisura?: string;
  readonly codiceIva?: string | null;
  /** SEMPRE netto canonico in unità minori, MAI la stringa da mostrare. */
  readonly prezzoUnitarioNettoMinor?: number | null;
  readonly costoUnitarioNettoMinor?: number | null;
  readonly prezzoVenditaNettoMinor?: number | null;
  readonly prezzoShopifyNettoMinor?: number | null;
  readonly prezzoBarratoNettoMinor?: number | null;
  /**
   * ⛔ **ELEGGIBILITÀ dell'articolo, non il valore di una spunta.**
   *
   * La regola è una sola — `kind !== 'service' && managesStock !== false` — e
   * vale per tutti. Ma **Impegna, Carica e Scarica restano tre effetti
   * distinti**: campo persistito, default, effetto sul backend e significato
   * non si fondono (`03` §18.4, Blocco 0 §6.2).
   *
   * È il consumer a mapparla:
   *
   *   Ordine cliente   → commitsStock
   *   Arrivo merce     → loadsStock (Carica)
   *   Vendita, DDT     → Scarica
   *   Reso             → Carica
   */
  readonly gestisceMagazzino?: boolean;
  readonly sconto?: string;
  readonly codiceFornitore?: string;
}

// ⛔ QUI c'erano i SERIALI, da azzerare a ogni richiamo. Fuori: il Blocco 0
//    tiene il modello seriali esplicitamente APERTO e `03` §5.3 dice di
//    introdurli solo dopo la ricostruzione del loro contratto. Azzerarli adesso
//    sarebbe decidere una regola dentro un contratto che ne ha un altro da
//    scrivere.

/** Letture di ADESSO, non del documento: si riscrivono anche su riga salvata. */
export interface LettureVive {
  readonly giacenza: number;
  readonly disponibile: number;
  readonly impegnata: number;
}

export type SegnalazioneRichiamo =
  | { readonly tipo: 'prezzo-assente-per-listino'; readonly listino: ListinoChoice }
  | { readonly tipo: 'codice-iva-non-risolto' }
  | { readonly tipo: 'codice-iva-articolo-di-altra-famiglia'; readonly vatCodeId: string }
  | {
      readonly tipo: 'articolo-non-eleggibile-a-magazzino';
      readonly causa: 'servizio' | 'non-gestito';
    }
  | { readonly tipo: 'articolo-sostituito-su-riga-salvata'; readonly precedente: string };

/** Union discriminata: o si risolve tutto, o non si scrive NIENTE.
 *  Non esiste il risultato parziale — è il difetto che chiude. */
export type EsitoRichiamoArticolo =
  | {
      readonly esito: 'risolto';
      readonly valori: ValoriArticoloDaScrivere;
      readonly letture: LettureVive;
      readonly segnalazioni: readonly SegnalazioneRichiamo[];
    }
  | { readonly esito: 'articolo-illeggibile'; readonly variantId: string };
```

```ts
// ── document-line-article-resolver.util.ts ──────────────────────────────────

/**
 * Il richiamo di un articolo su una riga: la riga si RESETTA e prende i valori
 * dell'articolo, anche a parità di articolo. Dove l'articolo non ha un valore,
 * il campo torna vuoto.
 *
 * Restano fuori solo QUANTITÀ e SCONTO DIGITATO: non hanno una sorgente in
 * anagrafica, quindi non c'è niente con cui sostituirli. La quantità non compare
 * nemmeno nell'uscita: la scrive il livello di acquisizione, che è l'unico a
 * sapere se si sta aggiungendo una riga o sommando a una esistente.
 *
 * Pura e sincrona: nessun FormControl, nessuna rete, nessuna conversione di
 * visualizzazione. I valori economici escono NETTI in unità minori con la loro
 * coda: la conversione netto/ivato e la stringa a due decimali sono della
 * maschera, che è l'unica a conoscere la propria modalità.
 */
export function risolviRichiamoArticolo(input: {
  readonly articolo: VariantSummary;
  readonly policy: PolicyRichiamoArticolo;
  readonly contesto: ContestoRichiamoArticolo;
  readonly riga: StatoRigaAlRichiamo;
}): EsitoRichiamoArticolo;
```

```ts
// ── document-line-article.service.ts ────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DocumentLineArticleResolverService {
  /**
   * Procura il riepilogo se non è già in mano al chiamante, poi delega alla
   * funzione pura.
   *
   * CONTRATTO: se il riepilogo non si ottiene, restituisce 'articolo-illeggibile'
   * e NON produce valori. Oggi tre maschere agganciano la riga e la lasciano
   * vuota perché il riepilogo non era nelle liste in pagina — l'esito parziale
   * qui non esiste.
   *
   * La guardia di identità («la riga porta ancora questo variantId?») resta al
   * chiamante: è lui a possedere il FormGroup, e solo lui sa se nel frattempo
   * la riga è cambiata.
   */
  richiama(input: {
    readonly variantId: string;
    readonly articoloNoto?: VariantSummary | null;
    readonly locationId?: string | null;
    readonly policy: PolicyRichiamoArticolo;
    readonly contesto: ContestoRichiamoArticolo;
    readonly riga: StatoRigaAlRichiamo;
  }): Observable<EsitoRichiamoArticolo>;
}
```

---

## 3. I CAMPI CHE PRODUCE

| Campo                                                                                           | Regola unica                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Modulato da       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **`titolo`**                                                                                    | `articolo.productName \|\| articolo.title`. **Mai** concatenato con la variante: `title` è il display completo, ed è ripiego solo dove `productName` è vuoto (lì non c'è nome da duplicare).                                                                                                                                                                                                                                                                               | —                 |
| **`variantLabel`**                                                                              | `articolo.variantLabel ?? ''`. Prodotto sempre. Se l'articolo non ha opzioni, è stringa vuota — non è un'assenza da riempire con altro.                                                                                                                                                                                                                                                                                                                                    | `campi`           |
| **`sku`**                                                                                       | `articolo.sku`. È l'identificativo che l'operatore legge sul documento: fotografato, viaggia nel payload.                                                                                                                                                                                                                                                                                                                                                                  | `campi`           |
| **`articleCode`**                                                                               | `articolo.articleCode`. **Chiave di ricerca, non dato del documento**: nessuna maschera lo persiste (verificato su tutti e sette i payload). Si riscrive sempre, anche su riga salvata.                                                                                                                                                                                                                                                                                    | `campi`           |
| **`barcode`**                                                                                   | `articolo.barcode ?? ''`. Stessa natura di `articleCode`. Vedi **DOMANDA APERTA 1**.                                                                                                                                                                                                                                                                                                                                                                                       | `campi`           |
| **`unitaDiMisura`**                                                                             | `articolo.unitOfMeasure ?? ''`. **Nessun `'pz'` cablato e nessun default di tenant**: `03` §13 dice che il default viene DALL'ARTICOLO, e inventare adesso una convenzione aziendale per coprire un ripiego sarebbe una regola nuova nascosta in un contratto. Se la summary non la porta, si corregge la summary. Catturata all'ingresso, da lì è della riga.                                                                                                             | `campi`, contesto |
| **`codiceIva`**                                                                                 | La catena di **P1**, con `isActive` sempre e il filtro di famiglia. Se l'articolo porta un codice dell'altra famiglia si salta l'anello **e si segnala** (oggi si salta in silenzio). Nessun anello risolve → `null` + `codice-iva-non-risolto`: una riga senza IVA calcola imposta zero, e non deve farlo di nascosto. **Non tocca mai `persistedVatCodeId`** — il contratto binario resta intatto e fuori dal risolutore.                                                | **P1**            |
| **`prezzoUnitarioNettoMinor`**                                                                  | `listinoUnitPrice(articolo, contesto.listino)?.amountMinor ?? null`. `null` = campo vuoto **e** segnalazione `prezzo-assente-per-listino`. Oggi lo stesso articolo entra a zero in silenzio dall'ingresso e con avviso dal cambio listino: stessa condizione, due esiti.                                                                                                                                                                                                   | `campi`           |
| **`costoUnitarioNettoMinor`**                                                                   | ⛔ **Il costo canonico è NUMERICO, zero compreso.** `articolo.purchasePrice.amountMinor`, e `0` esce `0`. ⚠️ Se il costo è **mascherato dai permessi** (`showPurchaseCosts` falso) il campo **non si produce affatto**: una chiave assente vuol dire «non toccare», mentre un `null` scritto sulla riga CANCELLEREBBE il costo a chi non ha il diritto di vederlo. È la stessa decisione già presa sui costi canonici NOT NULL.                                            | `campi`           |
| **`prezzoVenditaNettoMinor`**<br>**`prezzoShopifyNettoMinor`**<br>**`prezzoBarratoNettoMinor`** | I valori d'anagrafica che l'Arrivo merce propone di riscrivere. **`null` non è zero**: un barrato assente è `null`, e verso Shopify la chiave non entra nella riga — `"0.00"` là è uno sconto inventato del 100%.                                                                                                                                                                                                                                                          | `campi`           |
| **`gestisceMagazzino`**                                                                         | ⛔ **ELEGGIBILITÀ dell'articolo, non il valore di una spunta.** `articolo.kind !== 'service' && articolo.managesStock !== false`. `managesStock` assente vale `true` (l'assenza del campo non è una negazione), ma `kind === 'service'` chiude comunque. `false` porta la segnalazione con la causa. **La regola di eleggibilità è una sola; Impegna, Carica e Scarica restano tre effetti distinti** e la mappano ciascuno sul proprio campo (`03` §18.4, Blocco 0 §6.2). | `campi`           |
| **`sconto`**                                                                                    | Prodotto **solo se `riga.scontoCorrente` è vuoto**, e vale `contesto.scontoControparte`. La stringa a cascata si passa intatta. Digitato = intoccabile, sostituzione d'articolo compresa.                                                                                                                                                                                                                                                                                  | `campi`, contesto |
| **`codiceFornitore`**                                                                           | `supplierCodeForDocumentLine({ linkedWith: codiceFornitoreDigitato, ofDocumentSupplier: codiceFornitoreDiTestata })`. Il codice con cui si è agganciato vince sul collegamento di testata.                                                                                                                                                                                                                                                                                 | `campi`, contesto |
| **`letture`**                                                                                   | `giacenza / disponibile / impegnata` dal riepilogo letto con il `locationId` del documento. Sono dichiaratamente **vive**: si riscrivono anche su riga salvata, perché sono una lettura di adesso.                                                                                                                                                                                                                                                                         | —                 |

**Non produce, mai:** `quantity` · `id` · `variantId` · `persistedVatCodeId` · `isReference` · la descrizione persistita di una riga che rientra da un documento.

### Le quattro domande aperte

**DOMANDA APERTA 1 — il barcode è un dato del documento?**
`SalesOrderLine` lo persiste; `DocumentLine` no; Trasferimento e Rettifica lo dichiarano «chiave di ricerca, non dato della riga»; il Banco lo dichiara vivo e lo rilegge. _Sospendo solo la persistenza:_ il risolutore lo produce comunque, e ogni payload resta com'è finché non è deciso.

**DOMANDA APERTA 2 — un articolo di tipo SERVIZIO ha senso su Trasferimento e Rettifica?**
Se `gestisceMagazzino` diventa `false`, la riga non muove nulla e il documento la porta per niente. Va rifiutata all'ingresso, avvisata, o accettata muta? _Sospendo solo `gestisceMagazzino` su quelle due maschere_, dove oggi è derivato da `Boolean(variantId)` al payload e non esiste come controllo.

**✅ DOMANDA APERTA 3 — CHIUSA il 24/08/2026: NESSUNA unità di misura di tenant.**
Qui si proponeva un `contesto.unitaDiMisuraPredefinita`. ⛔ Non si introduce: `03` §13 dice che il default della U.M. di riga viene **dall'articolo**, e inventare adesso una convenzione aziendale per coprire un ripiego sarebbe una regola nuova nascosta dentro un contratto che ne sta consolidando un'altra. Se l'articolo non la porta, il campo resta **vuoto**; se fosse la summary a non portarla, si corregge la summary. Il `'pz'` cablato in due maschere sparisce senza sostituto.

**DOMANDA APERTA 4 — cosa fa la colonna Variante sui documenti storici?**
Le righe già salvate hanno la variante dentro la descrizione. Il risolutore non tocca il caricamento, quindi la fotografia resta corretta — ma `variantLabel` resterà vuoto su tutto lo storico. Migrazione, o convivenza dichiarata? _Sospendo solo la retro-compilazione._

---

## 4. LE TRAPPOLE DELL'ADOZIONE

### 4.1 Rettifica di magazzino

- **Non c'è un solo test che inchiodi cosa scrive `onVariantSelect`.** La sostituzione non farà arrossare niente: il test va scritto **prima**, sul comportamento voluto, così è rosso e poi verde.
- `loadsStock: Boolean(line.variantId)` è calcolato **al payload**, in due posti (`saveAdjustment` e `persistNewOrUpdate`). Il risolutore produce `gestisceMagazzino`: serve un controllo dove atterrare, altrimenti il valore si perde fra l'ingresso e il salvataggio.
- `articleCode` e `barcode` non tornano dal caricamento e li mostrano due getter che leggono dal riepilogo (`lineArticleCode()`, `lineBarcode()`): se il risolutore li scrive nei controlli, quei due getter diventano una seconda verità.
- **Ordine di scrittura irrilevante qui** (niente IVA, niente denaro): è la ragione per cui questa maschera va per prima.
- `onVariantSelect(index, null)` sgancerebbe lasciando descrizione e codici del vecchio articolo. Ramo oggi morto, ma la firma lo ammette: il risolutore non modella lo sgancio, e va tolto dalla firma locale invece di ereditarlo.
- Codice morto dello Scarico manuale (`'Riga scarico'`, «Salva e scarica»): **non è un requisito**, è un residuo. Non trattarlo come un secondo tipo da servire.

### 4.2 Trasferimento interno

- **Formula identica alla Rettifica, carattere per carattere.** Si toccano insieme o divergono.
- Il ripiego `findVariantSummaryById(value, pinnedVariants(), searchedVariants())` **fallisce proprio nei due casi in cui serve**: il pannello di ricerca a tutta pagina (che ha una ricerca sua, scollegata da `variantSearchDraft`) e l'endpoint di rete di sicurezza (`resolveByCodeEndpoint` restituisce `summary: null` per costruzione). Il guscio che rifà la fetch chiude il buco — è un **cambio di comportamento visibile**, non un refactor.
- `variantSearchDraft` viene riempito con la **descrizione corrente** all'ingresso nel campo nome. Oggi è la stringa doppia, che come termine di ricerca non corrisponde a niente; col titolo pulito quella ricerca **comincia a funzionare**, e il pannello suggerimenti può aprirsi dove oggi taceva. Verificare a schermo.
- **Due body di salvataggio** che divergono già (`unitPriceMinor: 0` solo in uno). Un campo nuovo va in **entrambi**, o si comporterà diversamente a seconda che il documento sia nuovo o confermato — differenza che si vede solo riaprendo.
- Il config colonne è **condiviso con la Rettifica** e ha **sei preset**: una colonna Variante va aggiunta in tutti e sei, o sparirà in cinque viste su sei.
- `applyLineSort` ordina la colonna `product` leggendo `description`: spezzando il campo, va ripuntato.
- `isLineEmpty` (giro del fuoco, cinque campi) e `dropTrailingEmptyLines` (due campi) hanno definizioni diverse di "riga vuota": un campo nuovo va valutato contro **entrambe**.
- `onVariantSelect` **non chiama `markFormDirty()`**: il segnale arriva da `form.valueChanges`. Scrivere tutto con `emitEvent: false` spegnerebbe la guardia di uscita senza che nulla lo segnali — serve il rimbalzo esplicito finale.

### 4.3 Ordine fornitore

- **`onProductUpdatedFromPanel` bypassa l'imbuto**: chiama `applyVariantToLine` direttamente. Sostituire solo `onVariantSelect` lo lascia indietro. E va deciso separatamente: **tornare dalla scheda articolo non è un richiamo** — se resta collegato al risolutore, riazzera quantità, sconto e codice fornitore già digitati.
- Il **docblock del reset** argomenta `quantity → 1` ed esegue `discountPercent → ''`. Vanno riscritti insieme al codice: un commento che difende il comportamento tolto è l'invito a ripristinarlo.
- **`unitCostNetMinor` + `unitCost` sono canonico e vista.** Il risolutore dà solo il canonico; la vista la fa `costFieldValue`, che legge l'aliquota della riga. **L'IVA va scritta prima del costo**, o in modalità «Costo ivato» il valore mostrato nasce con l'aliquota sbagliata.
- `purchaseNet > 0 ? purchaseNet : null` diventa `0`: **cambio di valore salvato**, ed è la stessa forma che il prefill anagrafica poche righe sopra dichiara già sbagliata.
- Passando `ofDocumentSupplier`, questa maschera **guadagna** un comportamento che oggi non ha (non carica i collegamenti del fornitore di testata). Va deciso, non subito di soppiatto: senza il caricamento, il contesto lo passerà `null` e nulla cambia.
- `description` inviata al server è `productName || summary.title`: **la variante rientra dalla porta di servizio** se l'operatore svuota il nome. Va chiuso nello stesso passaggio.
- `variantCostSubscription` è riassegnata senza cancellare la precedente: passando al guscio, `switchMap` o disiscrizione esplicita.
- Tutte le scritture silenziose + **un solo** `this.lines.updateValueAndValidity()`: mantenere lo schema, o i totali si ricalcolano dieci volte per richiamo.
- `defaultPurchaseVatCodeId()` può tornare `''` legittimamente: è il caso che produce `codice-iva-non-risolto`, e va mostrato invece di lasciare la riga a imposta zero.

### 4.4 Documenti vendita _(vedi avvertenza in §5)_

- **`persistedVatCodeId` non viene mai ripristinato al caricamento.** Il contratto binario **non è mai attivo in modifica** su questa maschera: il codice IVA riparte a ogni salvataggio e il server rifotografa lo snapshot. Il risolutore non lo tocca per contratto — se non si aggiunge quel patch, il difetto resta esattamente dov'è.
- `commitCodeLookup` può agganciare con `summary: null` e lasciare la riga vuota **e i campi codice bloccati**: l'operatore non può nemmeno ritentare. Il guscio chiude il buco; è un cambio visibile.
- **Non esistono i controlli `unitOfMeasure` e `variantLabel`**, non esistono le colonne, e `DocumentLineInputBody` non ha `variantLabel`. Sono aggiunte a quattro livelli, non sostituzioni.
- `unitPrice` è scritto **senza** `emitEvent: false` mentre `loadsStock`/`vatCodeId` **con**: uniformare cambia quando compare «Modifiche non salvate» e quando scatta `canDeactivate`.
- `managesStock !== false` fa sì che `undefined` accenda la spunta. Passando anche a `kind`, decidere il tipo sconosciuto (proposta: si comporta come `article`).
- Il payload forza `loadsStock: false` quando la colonna è nascosta: **resta di maschera**, non diventa policy.
- `productPanelLineIndex` è memorizzato all'apertura, e le righe si riordinano con drag&drop e con l'ordinamento colonne: un riordino a pannello aperto scrive sulla riga sbagliata. Preesistente, ma il risolutore la rende più visibile perché scrive più campi.
- `this.lines.at(index)` senza null-check nel risolutore locale: unico punto del file senza `?.`.
- Le **righe incluse** e quelle da conversione non passano dal risolutore (non sono richiami d'articolo): il fatto che perdano lo `sku` è un difetto separato, da non confondere con l'adozione.

### 4.5 Ordine cliente

- **Due scrittori paralleli**: `onVariantSelect` e `applyScannedVariant`. Il secondo non passa dal primo, scrive `variantId` e `quantity` da sé e delega il resto in differita. Vanno portati entrambi sul risolutore, e l'atterraggio calcolato in un solo posto.
- **La doppia applicazione**: tre call site chiamano `onVariantSelect` **e poi** `pinVariantSummary` in fila. Oggi l'esito coincide per caso; col reset uniforme la seconda passata è idempotente ma **rifà la fetch**. Togliere la seconda chiamata.
- `onProductUpdatedFromPanel` riscrive senza condizioni nome, codici, U.M., variantLabel e **la spunta girata a mano**. Non è un richiamo: va staccato, o limitato alle sole **letture vive**.
- `refreshAllLineSummaries` riscrive `articleCode` su tutte le righe, in modo asincrono, dopo ogni caricamento, include, conversione e cambio location. Se il risolutore prende in carico `articleCode`, quella funzione gli fa concorrenza: va ridotta alle letture vive.
- **Il registro perde tre campi**: su Preventivo, DDT vendita e Scarico manuale, `barcode`, `unitOfMeasure` e `variantLabel` sono forzati a `''` al caricamento e non escono nel payload. Il risolutore li produce e **si perderanno al primo salvataggio** finché non arriva la colonna. Dichiararlo, non scoprirlo.
- `rememberLineNet`: chi scrive `unitPrice` deve aggiornare il netto canonico, o la coda a sei decimali sparisce al primo risalvataggio. Il risolutore dà il netto minor — memorizzarlo è della maschera.
- **IVA prima del prezzo**: `priceFieldValue(minor, lineRateOf(line))`. Scrivere il prezzo prima del codice mostra il netto dove si vede l'ivato.
- Se il risolutore riapre i campi codice sulla riga agganciata (oggi `commitCodeLookup` esce subito e `isFieldEnabled` li spegne), **ogni conferma di codice su riga agganciata diventerà un reset**. Va deciso: non è un effetto collaterale accettabile.
- `applyCustomerDefaults` è il gemello del blocco sconto: se il risolutore prende in carico lo sconto proposto, la regola resta scritta in due posti.

### 4.6 Arrivo merce

- **L'effect di riallineamento è la trappola principale.** Legge `pinnedVariants()` e `searchedVariants()`, che derivano da `lines.valueChanges`: agganciare un articolo cambia la lista di id, parte un `forkJoin` per **ogni** variante in riga, e al ritorno l'effect riscrive `articleCode`/`sku`/`barcode` di **tutte** le righe. Un risolutore che scrive e si considera finito **viene scavalcato un istante dopo, in modo asincrono e non ordinato**. Va smontato per primo, o la sostituzione non si vede.
- **Tre copie della stessa scrittura** (`applyVariantSummaryToLine`, l'effect, `refreshLineVariantSummary`) con **tre regole diverse** sul nome (`productName || title` · `productName` nudo · `productName || title`). Vanno a una.
- `setSalesPrice` e le due scritture del costo sono le **uniche** senza `emitEvent: false`: sono loro a ri-armare l'effect. Uniformare cambia quante volte gira.
- **Il costo scritto all'ingresso non registra il canonico**: adottando il risolutore il valore salvato **cambia di frazioni di centesimo**. È un miglioramento, ma i test sui totali se ne accorgeranno e va detto perché.
- **IVA prima del costo**, per la stessa ragione dell'Ordine fornitore.
- **Due costruttori di riga paralleli** (`createLineFromSupplierOrderLine`, `createLineFromCsv`) che non passano da `createLine` né dall'imbuto: una riga da ordine fornitore nasce **agganciata** con `productName` uguale allo SKU, e l'effect non la corregge perché il campo non è vuoto. Chiamando il risolutore su quelle righe, il nome cambia: comportamento visibile.
- I campi identità sono `disable()`d su riga agganciata: leggere con **`getRawValue()`**, mai `.value`.
- `quantity` ha due validatori (`min(1)` riga nuova, `min(0)` riga caricata): **non ricreare il gruppo**, o una riga ordinata-e-non-ricevuta diventa invalida.
- `loadsStock` forzato a `true` dallo scan **dopo** che `syncLineFieldAccess` può averlo spento e disabilitato: corsa da chiudere, non da ereditare.
- `codesNotFound` è una cache che sopravvive all'ingresso: le tre `clear()` sui campi codice vanno riportate.
- `applySupplierDefaultsToLine` **non copre tutte le righe nuove** (mancano scansione, barcode sconosciuto, riga minima, giro del fuoco): sostituendo l'ingresso senza toccarla, quelle righe restano senza sconto né IVA finché non entra un articolo.
- `confirmApplyVatToAllLines` **non invalida i netti canonici** mentre `onLineVatSelect` sì: divergenza preesistente, da conservare o correggere **con intenzione**.

### 4.7 Vendita al banco

- **La deduplica A14 sta prima del risolutore e deve restarci.** Ribattere lo stesso EAN incrementa la riga e **non** rifà l'ingresso: se il risolutore entrasse anche lì, il prezzo ritoccato tornerebbe a listino e i pezzi smetterebbero di sommarsi.
- **Il ramo B della ricerca salta `acquireVariant`**: niente deduplica (due righe con lo stesso variantId) e, su riga salvata, scrive **solo `variantId`** — il documento esce con la descrizione di un articolo e la variante di un altro. Il richiamo esplicito che resetta tutto chiude il difetto: è il cambio più grosso dell'intera adozione.
- **La guardia `serverLineId` va ripensata, non rimossa.** La regola «la riga è una fotografia» protegge dalla ri-fotografia _implicita_ (risalvataggio, effect, ritorno dal pannello anagrafica), non dal **gesto esplicito** dell'operatore che sceglie un altro articolo. Questa distinzione è il cardine, e vale su tutte e sette le maschere.
- La `WeakMap` del netto è chiavata sull'`AbstractControl` e `netMinorOf` confronta **stringhe** (`shown === raw`): **ricreare il gruppo perde la memoria in silenzio**, e scrivere `unitPrice` senza `ricordaNetto` fa cadere il ramo canonico.
- L'aliquota usata per mostrare il prezzo (`rateOf(...)` → `0` se l'articolo non ha un codice proprio) **diverge da quella che il server applicherà** (predefinito aziendale): il risolutore che risolve la catena completa chiude la divergenza **e cambia i totali mostrati**.
- **Il backend va corretto insieme.** Due `lineDescription` identiche (Vendita e Reso) concatenano `${productName} — ${optionSummary}`; correggerne una lascia il difetto sull'altro modo. E `resolveVariants` **non seleziona** `product.kind`, `product.managesStock` né `unitOfMeasure`: la regola servizio oggi vive solo lato client, e la U.M. non è raggiungibile dal server.
- `descriptionForLinePayload` confronta **una** stringa: spezzando titolo e variante servono due confronti, o il contratto binario della descrizione risponde a caso.
- Reso e Vendita divergono già sul confine (`restockable` obbligatorio, `loadsStock` facoltativo con default `true`): **non uniformare senza deciderlo**.
- La card mobile mostra ed edita `description` come **campo unico**: spezzarla va progettato anche lì, o su mobile la variante sparisce.
- L'unità di misura al banco è **cinque punti**, non uno: due DTO, il form, il payload, i due `computedLines`, i due `toData`.
- **Le fine riga del repo sono miste**: su file da 1800 righe una sostituzione con `\n` fallisce in silenzio e lascia il lavoro a metà.

---

## 5. L'ORDINE DI ADOZIONE

Il criterio non è la dimensione del file: è **quante scritture concorrenti** ci sono e **quanto lontano arriva il cambiamento**. Ogni maschera si tocca una volta sola, per tutti i suoi campi.

| #     | Maschera                     | Perché qui                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Trasferimento interno**    | ⛔ **Qui c'era la Rettifica, e non può stare prima**: `03` §25 Fase 6 e §2 la rinviano esplicitamente al suo blocco dedicato, insieme all'Inventario. Il Trasferimento ha la **formula identica carattere per carattere** e lo stesso config colonne, quindi conserva tutto il vantaggio: perimetro minimo, nessuna IVA, nessun denaro, un solo imbuto, nessun effect concorrente. È il **banco di prova del contratto** — se il risolutore serve bene una riga senza IVA e senza denaro, la forma è giusta — e il difetto che chiude (il nome scritto due volte) è il più visibile e il meno rischioso. |
| **2** | ⏸ **Rettifica di magazzino** | **Rinviata al suo blocco**, non adottata qui. Il profilo `movimento-interno` la regge già e la formula è la stessa del Trasferimento: quando quel blocco si apre, l'adozione è una sostituzione e basta. Finché resta rinviata, il difetto del nome doppio resta suo — e va scritto, non dimenticato.                                                                                                                                                                                                                                                                                                    |
| **3** | **Ordine fornitore**         | Un solo imbuto, tutte le scritture silenziose più un rimbalzo, catena IVA a due anelli, nessuno scanner, nessuna spunta. Introduce per la prima volta **il denaro** (canonico + vista) e **la famiglia acquisto**. Un solo bypass da chiudere. È dove si verifica che «IVA prima del costo» regge come vincolo di contratto e non come commento.                                                                                                                                                                                                                                                         |
| **4** | **Documenti vendita**        | Un solo risolutore locale, quattro tipi ma **una sola persistenza**. Introduce la famiglia vendita e il listino. Porta due difetti da chiudere (aggancio senza riepilogo, `persistedVatCodeId` mai ripristinato) e due campi da **aggiungere** con colonna e payload. **Avvertenza: se `feature/fattura-elettronica` sta ancora riscrivendo questa maschera, va scambiata con la 5** — adottare su un file in riscrittura produce un conflitto che nessuna regola di merge arbitra bene.                                                                                                                 |
| **5** | **Ordine cliente**           | Quattro tipi, **due persistenze**, due scrittori paralleli, doppia applicazione su tre call site, una riscrittura asincrona concorrente. Ma nessun effect che rilancia da solo, e `variantLabel` **c'è già**: il costo è di riconciliazione, non di scoperta. Va dopo aver provato il contratto su una maschera di vendita più semplice.                                                                                                                                                                                                                                                                 |
| **6** | **Arrivo merce**             | L'effect di riallineamento è **l'unico posto, in sette maschere, dove il risolutore può essere scavalcato in modo asincrono e non ordinato**. Più tre copie della stessa scrittura, due costruttori di riga paralleli, e un cambio di valore salvato sui totali. Va affrontato quando il contratto è già assestato, perché qui il lavoro è smontare, non sostituire.                                                                                                                                                                                                                                     |
| **7** | **Vendita al banco**         | Ultima per tre ragioni cumulative: è **l'unica che tocca il backend** (due concatenazioni server, `resolveVariants` da estendere, due DTO); è l'unica con una **regola di acquisizione propria** che il risolutore non deve calpestare; ed è l'unica dove il difetto client si nasconde dietro un difetto server **identico**, quindi nessun test cambia colore correggendone uno solo. Ed è la maschera appena riscritta: toccarla per ultima significa toccarla col contratto già provato sei volte.                                                                                                   |

---

## 6. I TEST DEL CONTRATTO

### I test che dimostrano l'equivalenza

**T1 — Lo stesso articolo, quattro profili, gli stessi dati base.** _(il test centrale)_
In `document-line-article-resolver.util.spec.ts`: un `VariantSummary` solo, la funzione pura eseguita una volta per ciascuno dei quattro profili.

⛔ **L'asserzione è sull'INTERSEZIONE, non su tutti i campi**: `campi` dice proprio che i profili hanno capacità diverse, quindi pretendere che ogni campo sia presente ovunque contraddirebbe P2. Il test si divide in due:

- **sui campi comuni a tutti e quattro** — `nomeProdotto`, `variantLabel`, `sku`, `articleCode`, `barcode`, `gestisceMagazzino` — i valori devono essere **identici**. È ciò che rende impossibile far divergere di nuovo il nome;
- **sui campi specifici** — `unitaDiMisura`, `codiceIva`, i valori economici, i tre prezzi d'anagrafica, `codiceFornitore` — si asserisce **presenza o assenza** secondo la capacità dichiarata, e il valore solo dove il campo esiste.

**T2 — La variante non entra mai nel titolo.**
`productName: 'Maglia'`, `title: 'Maglia — M / Rosso'`, `variantLabel: 'M / Rosso'` → `titolo === 'Maglia'` **e** `variantLabel === 'M / Rosso'`. Con il caso di ripiego: `productName: ''` → `titolo === title` (lì non c'è nome da duplicare). Da ripetere come test di componente su ogni maschera: è la regressione più facile da reintrodurre.

**T3 — Il reset a parità d'articolo.**
Riga con prezzo, IVA e U.M. modificati a mano; richiamo dello **stesso** `variantId` → prezzo, IVA e U.M. tornano d'anagrafica; **`sconto` digitato e quantità restano** (la quantità non compare proprio nell'uscita, e l'asserzione è sull'assenza della chiave).

**T4 — Il servizio non fa partire nessuna spunta.**
Tre casi: `kind: 'service'` → `false`; `kind: 'article'` con `managesStock: false` → `false`; `managesStock: undefined` → `true`. Più l'asserzione che il valore è lo stesso nei tre profili che hanno la spunta, cioè che «carica», «scarica» e «impegna» non si comportano diversamente.

**T5 — Le due catene IVA, e l'asserzione sul valore giusto.**
Acquisto: articolo → fornitore → predefinito, un caso per anello. Vendita: articolo → predefinito. Più il caso «articolo con codice dell'altra famiglia» (si salta l'anello **e** si segnala) e «nessun anello risolve» (`null` + `codice-iva-non-risolto`). **Ogni caso asserisce quale codice è stato scelto**, non solo che qualcosa è stato rifiutato: è il difetto che i test di questo repo hanno già mostrato di avere.

**T6 — Il contratto binario resta fuori.**
`persistedVatCodeId` non è mai una chiave dell'uscita. Asserzione sull'assenza, non sul valore.

**T7 — Il denaro.**
Il valore esce **netto in unità minori con la coda canonica** — quella di `toStorableMinor`, quattro cifre di centesimo: 25,00 € ivati al 22% valgono `2049.1803`, e sono quelle cifre a farli tornare 25,00 quando il prezzo si rimostra ivato. ⛔ **Non una precisione nuova**: `2049.180328` era una coda inventata oltre il contratto già consolidato, e il risolutore non deve introdurre una regola di precisione diversa dalle utility canoniche in uso. Poi: un costo `0` esce `0` e non `null`; un `compareAtPrice` assente esce `null` e non `0`; nessun campo economico esce come stringa.

**T8 — L'articolo illeggibile.**
Il guscio con un `variantId` che non si risolve restituisce `esito: 'articolo-illeggibile'` e **nessun valore**. È il test che vieta il risultato parziale, cioè la riga agganciata e vuota che oggi tre maschere producono.

**T9 — Il cablaggio, uno per maschera.**
Un test di componente per maschera che verifica _che il richiamo scrive i campi che il risolutore ha prodotto_ — non che li produce bene (quello lo fanno T1-T8). Include, per l'Arrivo merce e l'Ordine fornitore, l'asserzione che il codice IVA è scritto **prima** del costo.

### I test esistenti da aggiornare o eliminare

| Test                                                                                                                              | Cosa fare, e perché                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/features/documents/transfer-form.component.spec.ts:243` — `line.controls.description.setValue('Maglia · M')`             | **Aggiornare.** È un _setup_, non un'asserzione: continuerà a passare descrivendo il mondo vecchio, che è peggio di fallire. Va riscritto come titolo + `variantLabel`.                                                               |
| `src/app/features/documents/stock-operation-form.component.spec.ts`                                                               | **Verificare** la presenza di setup analoghi con il separatore `·`. L'ispezione non ne nomina, ma le due maschere sono gemelle.                                                                                                       |
| `supplier-order-form.component.spec.ts` — eventuali test che congelano `orderedQuantity → 1` e `discountPercent → ''` al richiamo | **Eliminare.** Congelano il comportamento che la regola del proprietario toglie. Non li ho visti nominati nell'ispezione: vanno cercati prima di toccare la maschera, perché sarebbero l'unico ostacolo _legittimo_ alla 3ª adozione. |
| I test dei **totali** dell'Arrivo merce                                                                                           | **Ricalcolare le attese**, e scrivere nel commit _perché_: il costo che passa dal canonico cambia di frazioni di centesimo. Un'attesa aggiornata senza spiegazione diventa un difetto invisibile alla prossima lettura.               |
| I test di `api/src/store-sales/store-sales.service` che asseriscono una `description` contenente `' — '`                          | **Aggiornare**; e se `lineDescription` sparisce, i suoi test spariscono con lei. Sono i test che oggi **congelano la concatenazione lato server**, cioè il difetto dal lato che non si guarda.                                        |
| `document-line-vat-payload.util.spec.ts`                                                                                          | **Non si tocca.** Il contratto binario resta esattamente com'è, e il risolutore ne sta fuori per costruzione. Che questo file non cambi è di per sé una verifica dell'adozione.                                                       |
| Trasferimento e Rettifica, sul gesto d'ingresso                                                                                   | **Non esistono.** Vanno scritti prima della sostituzione, non dopo: sono le due maschere che si toccano per prime, e senza un test rosso la prima adozione non ha nessuna prova di aver funzionato.                                   |
