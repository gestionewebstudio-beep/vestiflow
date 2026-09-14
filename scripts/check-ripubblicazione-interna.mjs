#!/usr/bin/env node
/**
 * check:ripubblicazione-interna — la ripubblicazione di un disallineamento
 * resta un percorso INTERNO, e non diventa un invio forzato a disposizione di
 * chiunque.
 *
 * ⭐ **La regola che difende**, dal mandato del proprietario del 09/09/2026:
 *
 *      Superare il confronto con l'ultimo inviato SOLTANTO nel percorso
 *      interno di recupero del disallineamento.
 *      Nessun parametro di forzatura esposto all'operatore.
 *
 * ⛔ **Senza questa guardia il vincolo era solo un commento.** Il metodo
 *    `ripubblicaDisallineamento` e' pubblico su un provider esportato dal
 *    modulo Shopify e iniettato da altri servizi: niente, nel linguaggio,
 *    impediva a un secondo chiamante di usarlo — e nessuna prova sarebbe
 *    diventata rossa. Un vincolo che nessuno verifica non e' un vincolo.
 *
 * Verifica due cose, e la seconda e' quella che conta:
 *
 *   1. `ripubblicaDisallineamento` e' chiamato SOLO dal ritentativo delle
 *      quantita' (piu' la propria definizione e le prove);
 *   2. la bandiera interna che fa saltare il confronto e' passata accesa da
 *      QUELLA sola porta: se domani `pushLevel` la accendesse, il sorpasso
 *      diventerebbe la regola per i suoi quattro chiamanti ordinari — che sono
 *      documenti, movimenti, riconciliazione e la porta unica dei canali.
 *
 * ⚠️ **Che cosa NON copre.** E' analisi statica del testo: vede una chiamata
 *    scritta, non una raggiunta per riflessione o costruita a runtime. Per
 *    quelle valgono le prove, che verificano il comportamento.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROSSO = '[31m';
const VERDE = '[32m';
const GRASSETTO = '[1m';
const FINE = '[0m';

const PORTA = 'ripubblicaDisallineamento';
const FILE_PUSH = path.join('api', 'src', 'shopify', 'shopify-inventory-push.service.ts');
const FILE_RITENTATIVO = path.join(
  'api',
  'src',
  'shopify',
  'shopify-inventory-republish.service.ts',
);

/** I soli file applicativi in cui il nome puo' comparire. */
const AMMESSI = new Set([FILE_PUSH, FILE_RITENTATIVO]);

/** Le prove possono nominarlo: e' il loro mestiere. */
function eUnaProva(relativo) {
  return (
    relativo.includes('.spec.') ||
    relativo.includes('integration-spec') ||
    relativo.split(path.sep).includes('test')
  );
}

function file(radice, estensioni) {
  const trovati = [];
  const visita = (dir) => {
    for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
      if (voce.name === 'node_modules' || voce.name === 'dist' || voce.name.startsWith('.')) {
        continue;
      }
      const pieno = path.join(dir, voce.name);
      if (voce.isDirectory()) {
        visita(pieno);
      } else if (estensioni.some((e) => voce.name.endsWith(e))) {
        trovati.push(pieno);
      }
    }
  };
  if (fs.existsSync(radice)) {
    visita(radice);
  }
  return trovati;
}

/**
 * Il testo senza i COMMENTI.
 *
 * ⛔ **Serve, e non e' pignoleria.** In questo progetto un difetto corretto
 *    lascia dietro di se' la riga che lo descrive — «qui c'era X, e portava a
 *    Y». Una guardia che cerca X nel testo grezzo arrossisce proprio sul
 *    commento che spiega perche' X non c'e' piu': o la si spegne, o si
 *    cancella la memoria del difetto. Nessuna delle due e' accettabile.
 *
 * ⚠️ Toglie i blocchi e le righe INTERE di commento, non i `//` a fine riga:
 *    quelli non si possono rimuovere senza rompere stringhe come
 *    `vestiflow://...`, e per quel che serve qui non danno fastidio.
 */
function soloCodice(testo) {
  return testo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((riga) => !/^\s*(\/\/|\*)/.test(riga))
    .join('\n');
}

const guasti = [];

// ── 1 · chi nomina la porta di recupero ──────────────────────────────────────
const sorgenti = [...file(path.join('api', 'src'), ['.ts']), ...file(path.join('src'), ['.ts'])];
let chiamantiApplicativi = 0;
for (const pieno of sorgenti) {
  const relativo = path.relative('.', pieno);
  const testo = fs.readFileSync(pieno, 'utf8');
  if (!testo.includes(PORTA)) {
    continue;
  }
  if (eUnaProva(relativo)) {
    continue;
  }
  if (!AMMESSI.has(relativo)) {
    guasti.push(
      `${relativo} nomina ${PORTA}. La ripubblicazione e' un percorso interno del ` +
        'ritentativo delle quantita\': un secondo chiamante la trasformerebbe in un invio ' +
        'forzato, che il mandato vieta.',
    );
    continue;
  }
  if (relativo === FILE_RITENTATIVO) {
    chiamantiApplicativi += 1;
  }
}

if (chiamantiApplicativi === 0) {
  guasti.push(
    `${FILE_RITENTATIVO} non chiama piu' ${PORTA}: il ritentativo sarebbe tornato a usare ` +
      "la porta ordinaria, e il disallineamento canonico tornerebbe a non ripubblicarsi.",
  );
}

// ── 2 · la bandiera interna si accende da UNA porta sola ─────────────────────
if (!fs.existsSync(FILE_PUSH)) {
  guasti.push(`${FILE_PUSH} non esiste piu': questa guardia va riscritta, non tolta.`);
} else {
  const testo = fs.readFileSync(FILE_PUSH, 'utf8');
  // ── Le PORTE del corpo condiviso, una per modo ────────────────────────────
  //
  // ⛔ **Qui si contavano DUE chiamate e si cercava un `true` in coda.** Dal
  //    10/09/2026 i modi sono tre — ordinario, recupero, riallineamento — e il
  //    modo viaggia come stringa, non come bandiera: contare due chiamate
  //    faceva fallire la guardia per il fatto stesso che il terzo modo esiste.
  //
  // ⭐ **Cio' che protegge non cambia**: ogni modo si accende da UNA porta sola,
  //    e nessun'altra puo' chiedere il recupero — che supera il confronto con
  //    l'ultimo inviato — ne' il riallineamento, che asserisce un valore.
  const PORTE_PER_MODO = new Map([
    ['ordinario', 'pushLevel'],
    ['recupero', PORTA],
    ['riallineamento', 'riallineaCoppia'],
  ]);
  const chiamate = [...testo.matchAll(/return this\.esegui\(([^;]*?)\);/gs)];
  if (chiamate.length !== PORTE_PER_MODO.size) {
    guasti.push(
      `${FILE_PUSH}: attese ${PORTE_PER_MODO.size} chiamate a esegui(), trovate ${chiamate.length}. ` +
        'Ogni modo ha la sua porta e nessun altra: se il corpo condiviso ha cambiato ' +
        'forma, questa guardia va aggiornata insieme.',
    );
  }
  const modiVisti = new Set();
  for (const chiamata of chiamate) {
    const modo = /,\s*'([a-z]+)'\s*$/.exec(chiamata[1].trim())?.[1] ?? '(nessuno)';
    // Il metodo che la contiene: l'ultima dichiarazione prima della chiamata.
    const prima = testo.slice(0, chiamata.index);
    const dichiarazioni = [...prima.matchAll(/async\s+([A-Za-z0-9_]+)\s*\(/g)];
    const contenitore = dichiarazioni.at(-1)?.[1] ?? '(sconosciuto)';
    const attesa = PORTE_PER_MODO.get(modo);
    if (!attesa) {
      guasti.push(
        `${FILE_PUSH}: ${contenitore}() chiama esegui() con un modo non previsto (${modo}). ` +
          'I modi sono tre e ognuno ha la sua porta: uno nuovo va dichiarato qui.',
      );
      continue;
    }
    modiVisti.add(modo);
    if (contenitore !== attesa) {
      guasti.push(
        `${FILE_PUSH}: il modo «${modo}» e' acceso dentro ${contenitore}(), non ${attesa}(). ` +
          "Da un'altra porta il sorpasso del confronto — o l'asserzione di un valore — " +
          'diventerebbe disponibile a chi non deve averlo.',
      );
    }
  }
  for (const [modo, porta] of PORTE_PER_MODO) {
    if (!modiVisti.has(modo)) {
      guasti.push(
        `${FILE_PUSH}: nessuna porta accende piu' il modo «${modo}» (atteso in ${porta}()). ` +
          'Quel percorso smetterebbe di esistere in silenzio.',
      );
    }
  }
}

// ── 3 · il confronto viaggia SEMPRE con un numero, mai disattivato ───────────
//
// ⭐ **La politica, distinta dal contratto.** Shopify ammette
//    `changeFromQuantity: null` per disattivare il confronto; questo percorso
//    non deve usarlo mai — senza un ultimo valore CONFERMATO non si invia
//    affatto (`base_assente`). Il tipo del client dichiara `number | null`
//    perche' descrive l'API, quindi il divieto non lo puo' fare il linguaggio.
//
// ⛔ **Senza questa guardia il divieto era solo un commento.** Un `null` scritto
//    qui non fallirebbe la compilazione, non arrossirebbe nessuna prova
//    esistente, e ogni scrittura passerebbe: e' il ritorno alla scrittura cieca,
//    per una riga.
if (fs.existsSync(FILE_PUSH)) {
  const testo = fs.readFileSync(FILE_PUSH, 'utf8');
  const assegnazioni = [...testo.matchAll(/changeFromQuantity\s*:\s*([^,\n]+)/g)];
  if (assegnazioni.length === 0) {
    guasti.push(
      `${FILE_PUSH} non dichiara piu' changeFromQuantity: la scrittura sarebbe tornata ` +
        'assoluta, e il confronto concorrenziale non proteggerebbe piu' +
        "' nessuna finestra.",
    );
  }
  for (const assegnazione of assegnazioni) {
    const valore = assegnazione[1].trim();
    if (/^null\b/.test(valore) || /\?\?\s*null\b/.test(valore)) {
      guasti.push(
        `${FILE_PUSH}: changeFromQuantity vale «${valore}». Shopify ammette null — questo ` +
          'percorso no: disattiverebbe il confronto, e la scrittura tornerebbe cieca. ' +
          "Senza base confermata non si invia affatto (base_assente).",
      );
    }
  }
}

// ── 4 · gli userErrors si CLASSIFICANO, e la risposta assente non e' vuota ───
//
// ⭐ **Due difetti diversi, una sola forma testuale che li fa tornare.**
//
//    - `errori.length > 0` legge ogni `userError` come un rifiuto definitivo:
//      `IDEMPOTENCY_CONCURRENT_REQUEST` significa «ancora in corso», e chiuso
//      come rifiuto fa perdere la chiave mentre l'effetto arriva;
//    - `?.userErrors ?? []` trasforma una mutation assente nella firma della
//      riuscita, e il confermato avanza per una risposta che non c'era.
//
// ⛔ **Nessuno dei due fallisce da solo**: compilano, e nessuna prova
//    preesistente li vede. Sono esattamente il tipo di riga che rientra in una
//    rifattorizzazione «di pulizia».
const FILE_CLASSIFICAZIONE = path.join(
  'api',
  'src',
  'shopify',
  'shopify-inventory-user-error.util.ts',
);
const FILE_GRAPHQL = path.join('api', 'src', 'shopify', 'shopify-graphql.client.ts');

if (!fs.existsSync(FILE_CLASSIFICAZIONE)) {
  guasti.push(
    `${FILE_CLASSIFICAZIONE} non esiste piu': senza classificazione ogni userError torna a ` +
      "essere lo stesso esito, e «l'operazione e' ancora in corso» torna a chiudere il tentativo.",
  );
} else {
  // ── il riconoscimento e' per CODICE ESATTO, non per somiglianza ───────────
  //
  // ⛔ **La lettura per frammenti del nome sembra prudente e non lo e'.** Era
  //    difesa cosi': «sbagliare un nome produce una prudenza in piu', mai una
  //    scrittura in piu'». Falso: un frammento PROMUOVE uno sconosciuto a una
  //    classe che CONCLUDE, e una classe che conclude chiude il tentativo.
  //    `COMPARE_QUANTITY_REQUIRED` diventava una divergenza di quantita';
  //    `IDEMPOTENCY_KEY_PARAMETER_MISMATCH` faceva buttare via l'operazione
  //    originale — cioe' proprio cio' che la chiave di idempotenza protegge.
  //
  // ⛔ **E il messaggio non deve tornare a decidere**: due testi diversi
  //    descrivono gia' lo stesso codice — quello dell'enum e quello misurato
  //    sullo shop — e un testo puo' cambiare senza che cambi la versione.
  const testo = soloCodice(fs.readFileSync(FILE_CLASSIFICAZIONE, 'utf8'));
  const frammenti = /\bcodice\s*\.\s*(includes|startsWith|endsWith|match|search)\s*\(/.test(testo);
  if (frammenti) {
    guasti.push(
      `${FILE_CLASSIFICAZIONE}: il codice e' confrontato per SOMIGLIANZA. Un frammento non ` +
        'aggiunge prudenza: promuove uno sconosciuto a una classe che conclude, e quella ' +
        'chiude il tentativo. Il riconoscimento e\' per uguaglianza, sulla mappa esplicita.',
    );
  }
  if (/\bmessaggio\b|\berrore\s*\.\s*message\b/.test(testo)) {
    guasti.push(
      `${FILE_CLASSIFICAZIONE}: la classificazione guarda il MESSAGGIO. Un testo puo' cambiare ` +
        "senza che cambi la versione dell'API, e due testi diversi descrivono gia' lo stesso " +
        'codice. Il messaggio resta informativo: non chiude un tentativo.',
    );
  }
  if (!/CLASSE_PER_CODICE\s*\[/.test(testo)) {
    guasti.push(
      `${FILE_CLASSIFICAZIONE}: non si trova l'incontro per uguaglianza sulla mappa dei codici ` +
        'documentati. Se la forma e\' cambiata, questa guardia va aggiornata insieme.',
    );
  }
  if (!/\?\?\s*'sconosciuto'/.test(testo)) {
    guasti.push(
      `${FILE_CLASSIFICAZIONE}: un codice non in tabella non ripiega piu' su «sconosciuto». ` +
        'E\' il ripiego che conserva il tentativo: senza, un nome nuovo torna a concludere.',
    );
  }
}

if (fs.existsSync(FILE_PUSH)) {
  const testo = soloCodice(fs.readFileSync(FILE_PUSH, 'utf8'));
  if (!testo.includes('classificaRifiutiInventario')) {
    guasti.push(
      `${FILE_PUSH} non classifica piu' gli userErrors: un rifiuto di confronto, una ` +
        "validazione e un «ancora in corso» tornerebbero a essere lo stesso esito.",
    );
  }
  if (/\berrori\.length\s*>\s*0/.test(testo) || /\brifiuti\.length\s*>\s*0/.test(testo)) {
    guasti.push(
      `${FILE_PUSH}: un userError e' trattato per CONTEGGIO invece che per classe. ` +
        'IDEMPOTENCY_CONCURRENT_REQUEST significa «ancora in corso»: contato come rifiuto, ' +
        'fa chiudere il tentativo e perdere la chiave mentre la scrittura va a segno.',
    );
  }

  // ⭐ **L'invariante STRUTTURALE, e a scriverla e' stata una falsificazione
  //    fallita.** Provando a rimettere il conteggio con un altro nome di
  //    variabile, la ricerca testuale qui sopra non se n'e' accorta — e in quel
  //    caso specifico aveva ragione, perche' la riscrittura era equivalente. Ma
  //    ha mostrato che cercare una FORMA e' fragile: quello che conta e' che
  //    esista UNA SOLA STRADA per chiudere un tentativo su un rifiuto, e che
  //    passi dalla classificazione.
  const CHIUSURA = 'chiudiTentativoNonApplicato';
  const chiusure = [...testo.matchAll(new RegExp(`this\\.${CHIUSURA}\\(`, 'g'))];
  if (chiusure.length === 0) {
    guasti.push(
      `${FILE_PUSH}: nessuno chiama piu' ${CHIUSURA}(). Un rifiuto accertato lascerebbe il ` +
        'tentativo aperto per sempre, e la divergenza senza la sua nota.',
    );
  }
  for (const chiusura of chiusure) {
    const prima = testo.slice(0, chiusura.index);
    const dichiarazioni = [...prima.matchAll(/(?:private\s+)?async\s+([A-Za-z0-9_]+)\s*\(/g)];
    const contenitore = dichiarazioni.at(-1)?.[1] ?? '(sconosciuto)';
    if (contenitore !== 'applicaRifiuto') {
      guasti.push(
        `${FILE_PUSH}: ${CHIUSURA}() e' chiamato dentro ${contenitore}(), fuori dalla ` +
          'classificazione. Chiudere un tentativo senza guardare la CLASSE del rifiuto ' +
          "riporta il difetto: «l'operazione e' ancora in corso» tornerebbe a far perdere " +
          'la chiave mentre la scrittura va a segno.',
      );
    }
  }
}

if (fs.existsSync(FILE_GRAPHQL)) {
  const testo = soloCodice(fs.readFileSync(FILE_GRAPHQL, 'utf8'));
  if (/inventorySetQuantities\?\.userErrors\s*\?\?\s*\[\]/.test(testo)) {
    guasti.push(
      `${FILE_GRAPHQL}: una risposta MANCANTE viene ridotta a un elenco vuoto, che e' la ` +
        "firma della riuscita. Un payload assente e' un esito IGNOTO: va sollevato, cosi' il " +
        'push conserva il tentativo invece di avanzare il confermato.',
    );
  }
  const selezione = /inventorySetQuantities\([^)]*\)[^{]*\{\s*userErrors\s*\{([^}]*)\}/.exec(testo);
  if (!selezione) {
    guasti.push(
      `${FILE_GRAPHQL}: non si trova la selezione degli userErrors di inventorySetQuantities. ` +
        'Se la mutation ha cambiato forma, questa guardia va aggiornata insieme.',
    );
  } else if (!/\bcode\b/.test(selezione[1])) {
    guasti.push(
      `${FILE_GRAPHQL}: la selezione degli userErrors non chiede «code». Senza codice non si ` +
        'puo' +
        "' distinguere «ancora in corso» da un rifiuto, e tutto torna a essere un rifiuto.",
    );
  }
}

// ── 5 · «invio pendente» e «divergenza osservata» restano DISTINTI ───────────
//
// ⛔ **Sono due stati che si sanno in due modi diversi**, e fonderli e'
//    irreversibile: dopo, nessuno puo' piu' dire — guardando una riga in coda —
//    se il canale sia stato interrogato o no, e i due rimedi sono opposti.
//
//      mismatchDetected   il canale porta un numero diverso dall'atteso
//                         → lo si sa GUARDANDO il canale
//      localPushPending   non si e' scritto, e non si sa cosa porti il canale
//                         → lo si sa NON avendo guardato niente
//
// ⚠️ **La tentazione e' concreta**: accendere `mismatchDetected` al posto della
//    colonna nuova funziona, riusa la coda e costa una riga. E' stato proposto
//    il 10/09/2026, ed e' stato respinto per questa ragione.
if (fs.existsSync(FILE_PUSH)) {
  const testo = soloCodice(fs.readFileSync(FILE_PUSH, 'utf8'));
  const segna = testo.indexOf('async segnaInvioLocalePendente(');
  if (segna < 0) {
    guasti.push(
      `${FILE_PUSH}: non esiste piu' segnaInvioLocalePendente(). Un aggiornamento locale non ` +
        'trasmesso tornerebbe a dipendere da una vendita futura per essere ritrovato (prova P10).',
    );
  } else {
    // Il corpo del metodo: dalla firma alla dichiarazione successiva.
    const dopo = testo.slice(segna);
    const fine = dopo.indexOf('\n  private ', 1);
    const corpo = fine > 0 ? dopo.slice(0, fine) : dopo;
    if (/mismatchDetected|mismatchNote/.test(corpo)) {
      guasti.push(
        `${FILE_PUSH}: segnaInvioLocalePendente() tocca mismatchDetected o mismatchNote. ` +
          "Quello stato afferma «il canale porta un numero diverso», e lo si sa GUARDANDO il " +
          'canale: qui non si e\' guardato niente. Fusi, i due non si distinguono piu\'.',
      );
    }
    if (!/localPushPending:\s*true/.test(corpo)) {
      guasti.push(
        `${FILE_PUSH}: segnaInvioLocalePendente() non accende piu' localPushPending.`,
      );
    }
  }
}

if (fs.existsSync(FILE_RITENTATIVO)) {
  const testo = soloCodice(fs.readFileSync(FILE_RITENTATIVO, 'utf8'));
  // ── il filtro della coda: UNO SOLO, e comprende TUTTI E TRE i lavori ───────
  //
  // ⛔ **Qui si pretendevano DUE copie identiche del filtro**, una nel conteggio
  //    e una nel lotto, e si contava che fossero due. Proteggeva la cosa giusta
  //    — se il conteggio resta indietro, una coda piena risulta vuota e la
  //    passata non parte affatto — con la forma sbagliata: due copie da tenere
  //    allineate a mano sono il difetto, non il rimedio.
  //
  // ⭐ Dal 10/09/2026 il filtro e' scritto UNA volta (`righeInCoda`) e lo usano
  //    entrambi. La guardia verifica ora quello: la funzione esiste, comprende i
  //    tre criteri, e nessuno dei due punti si e' riscritto un OR per conto suo.
  const definizione = /function\s+righeInCoda\s*\([^)]*\)\s*\{[\s\S]*?\n\}/.exec(testo);
  if (!definizione) {
    guasti.push(
      `${FILE_RITENTATIVO}: non esiste piu' righeInCoda(). Il filtro della coda tornerebbe ` +
        'scritto in due punti — conteggio e lotto — e basterebbe aggiungere un criterio a uno ' +
        'solo perche\' una coda piena risultasse vuota e la passata non partisse.',
    );
  } else {
    const corpo = definizione[0];
    for (const [criterio, motivo] of [
      ['mismatchDetected: true', 'il canale porta un numero diverso dall\'atteso'],
      ['localPushPending: true', 'c\'e\' un aggiornamento locale non trasmesso'],
      ['pendingKey: { not: null }', 'un tentativo e\' partito e l\'esito e\' IGNOTO'],
    ]) {
      if (!corpo.includes(criterio)) {
        guasti.push(
          `${FILE_RITENTATIVO}: righeInCoda() non seleziona piu' «${criterio}» — ${motivo}. ` +
            'Quel lavoro esisterebbe sulla riga e nessuno lo cercherebbe.',
        );
      }
    }
  }
  const usi = testo.match(/righeInCoda\(tenantId\)/g);
  if (!usi || usi.length < 2) {
    guasti.push(
      `${FILE_RITENTATIVO}: righeInCoda() e' usata ${usi ? usi.length : 0} volte su 2 attese ` +
        '(la selezione del lotto e il conteggio). Se uno dei due torna a filtrare per conto ' +
        'proprio, i due si divaricano di nuovo.',
    );
  }
  if (!/row\.mismatchDetected\s*$/m.test(testo) && !/row\.mismatchDetected/.test(testo)) {
    guasti.push(
      `${FILE_RITENTATIVO}: la porta non dipende piu' da row.mismatchDetected. Un aggiornamento ` +
        'locale non trasmesso passerebbe dalla porta di RECUPERO, che supera il confronto con ' +
        "l'ultimo inviato: privilegi che quel caso non ha ragione di avere.",
    );
  }
}

if (guasti.length > 0) {
  console.error(`${ROSSO}${GRASSETTO}⛔ check:ripubblicazione-interna${FINE}`);
  for (const g of guasti) {
    console.error(`${ROSSO}   · ${g}${FINE}`);
  }
  process.exit(1);
}

console.log(
  `${VERDE}✅ check:ripubblicazione-interna — la ripubblicazione del disallineamento resta ` +
    "interna al ritentativo, la bandiera che supera il confronto con l'ultimo inviato si " +
    'accende da una porta sola, il confronto viaggia sempre con un numero, gli userErrors si ' +
    `classificano col loro codice e una risposta assente non passa per una riuscita.${FINE}`,
);
