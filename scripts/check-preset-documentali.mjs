#!/usr/bin/env node
/**
 * **Ogni profilo documentale mostra DATA e NUMERO.**
 *
 * ⭐ Deciso dal proprietario il 31/08/2026: _«I documenti hanno tutti la propria
 * data, quindi va messa la colonna data, numero (numero + serie), e sia da
 * scrivania che da mobile avremo la colonna data del documento e numerazione
 * interna propria.»_
 *
 * Sono le due colonne che un registro non può non avere: senza il numero non si
 * identifica la riga, senza la data non si ordina né si raggruppa. E valgono su
 * entrambe le viste — la card le prende dalle colonne accese.
 *
 * ## ⛔ I preset sono il posto dove si perdono
 *
 * Ognuno è un elenco scritto a mano, e il 31/08/2026 **dieci su quaranta**
 * avevano la data e non il numero. Il peggiore era «Registrazione fattura ·
 * Contabile», che portava il numero della fattura **del fornitore** e non quello
 * interno — due numeri che il file stesso dice di non confondere.
 *
 * ⚠️ **Nessun test poteva vederlo**: un preset è un array di stringhe, compila e
 * passa. Si vede solo scegliendo quel preset e guardando la tabella.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function tutti(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) tutti(p, acc);
    else acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

/** Gli id che valgono come data e come numero, in tutti i profili. */
const DATE = ['documentDate', 'placedAt', 'fulfilledAt', 'createdAt', 'occurredAt', 'orderDate'];

/**
 * ⚠️ `invoiceNumber` NON è nell'elenco, ed è il punto: è il numero della fattura
 * del FORNITORE, non la numerazione interna. Contarlo avrebbe fatto passare
 * proprio il preset più sbagliato.
 */
const NUMERI = ['reference', 'orderNumber', 'number'];

/**
 * ⭐ **Gli elenchi DOCUMENTALI, dichiarati uno per uno.**
 *
 * La regola «data e numero in ogni preset» vale per i documenti (`14` §67.2), non
 * per ogni registro: su Movimenti o Corrispettivi il proprietario non l'ha
 * decisa, e imporgliela sarebbe inventare un requisito.
 *
 * ⚠️ **Un elenco documentale nuovo va aggiunto qui a mano**, ed è voluto: una
 * regex che li «riconoscesse» ha già sbagliato in entrambe le direzioni — prima
 * escludendone otto, poi includendone quattro che non c'entrano.
 */
const DOCUMENTALI = [
  'documents/models/document-table-columns.config.ts',
  'sales-orders/models/sales-order-list-columns.config.ts',
  'orders/models/supplier-order-list-columns.config.ts',
  'online-sales/models/online-sale-list-columns.config.ts',
];

const CATALOGHI = tutti('src/app/features').filter(
  (f) => /columns\.config\.ts$/.test(f) && !f.includes('line'),
);

let difetti = 0;
let esaminati = 0;

/** I preset da controllare, raccolti sia inline sia dalle costanti referenziate. */
const corpoDaControllare = [];

/**
 * Un catalogo dichiara data e numero fra le colonne ACCESE?
 *
 * ⚠️ **Risale la catena delle derivazioni.** I cataloghi si compongono a strati —
 * `SHOPIFY_ORDER_LIST_COLUMN_DEFS` deriva da `SALES_ORDER_LIST_COLUMN_DEFS`, che
 * a sua volta può essere avvolto da `conColonneCondivise` — e fermarsi al primo
 * livello produceva tre falsi positivi: la guardia dichiarava «non riesco a
 * leggerla» su un preset perfettamente a posto.
 *
 * ⛔ **Il limite di profondità non è cautela decorativa**: una derivazione
 * circolare non compilerebbe, ma un errore in questa regex sì — e un ciclo qui
 * bloccherebbe il lint senza dire perché.
 */
function catalogoHaDataENumero(testo, nomeCatalogo, profondita = 0) {
  if (profondita > 5) {
    return false;
  }
  const corpo = new RegExp(
    `${nomeCatalogo}: readonly TableColumnDef\\[\\] = (?:conColonneCondivise\\()?\\[([\\s\\S]*?)\\n\\]`,
  ).exec(testo)?.[1];
  if (corpo === undefined) {
    return false;
  }
  /*
    ⛔ **Non basta che la colonna ESISTA: deve essere ACCESA.**

    La costante derivata prende `defaultVisible !== false`, quindi una colonna
    spenta non entra nel preset. Cercando la sola presenza dell'id, spegnere
    `orderNumber` faceva perdere il numero ai preset Default, Fornitore e
    Operativo — e la guardia restava verde. Falsificato il 31/08/2026.
  */
  const accesa = (id) => {
    const voce = new RegExp(`(?:id: |colonna\\()'${id}'([^\\n]*)`).exec(corpo)?.[1] ?? null;
    return voce !== null && !voce.includes('defaultVisible: false');
  };
  if (DATE.some(accesa) && NUMERI.some(accesa)) {
    return true;
  }
  // Non le ha in proprio: forse le eredita da quello da cui è composto.
  const genitore = /\.\.\.(\w+_COLUMN_DEFS)/.exec(corpo)?.[1];
  return genitore ? catalogoHaDataENumero(testo, genitore, profondita + 1) : false;
}

for (const file of CATALOGHI) {
  const t = readFileSync(file, 'utf8');
  /*
    ⛔ **Il perimetro è DICHIARATO, non dedotto da una regex.**

    Prima il gate cercava `documentDate|placedAt|fulfilledAt|orderDate` nel testo
    del file, e una revisione avversariale ha misurato che la copertura reale era
    **3 cataloghi su 11**: quelli con `createdAt` o `occurredAt` non venivano mai
    esaminati. ⚠️ Un elenco escluso dal gate non è «promosso»: è invisibile alla
    guardia, e la riga verde in fondo lo conta come a posto.

    ⛔ **Ma allargarlo a tutti sarebbe stato l'errore opposto**, ed è stato
    provato: la regola «data + numero» è stata decisa dal proprietario per i
    **documenti** (`14` §67.2). Applicandola a Movimenti o al Registro
    Corrispettivi comparivano 27 «difetti» su regole che nessuno ha deciso —
    e una guardia che inventa requisiti si impara a ignorare.

    ⭐ L'elenco è quindi esplicito: chi entra e chi resta fuori si legge, e
    aggiungere un elenco documentale nuovo è una riga da scrivere apposta.
  */
  if (!DOCUMENTALI.some((d) => file.endsWith(d))) {
    continue;
  }
  const nome = file.split('/').pop().replace('.config.ts', '');
  const mappe = [...t.matchAll(/(\w+_PRESETS)\s*:\s*TableViewPresetMap\s*=\s*\{([\s\S]*?)\n\};/g)];

  for (const [, nomeMappa, corpo] of mappe) {
    /*
      ⛔ **I preset che puntano a una COSTANTE erano saltati in silenzio.**

      `[TableViewPresetId.Default]: DEFAULT_IDS` non è un array inline, e la
      regex esige `]: [`. Cinque preset su 54 non venivano controllati — fra cui
      **Default**, quello che ogni utente vede per primo.
    */
    for (const [, quale, riferimento] of corpo.matchAll(
      /PresetId\.(\w+)\]\s*:\s*([A-Z_][A-Z0-9_]*)\s*,/g,
    )) {
      const costante = new RegExp(`(?:const|let) ${riferimento}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(
        t,
      )?.[1];
      if (costante !== undefined) {
        corpoDaControllare.push([nome, nomeMappa, quale, costante]);
        continue;
      }

      /*
        ⭐ **Una costante DERIVATA dal catalogo non è un difetto**, ed è il falso
        positivo che la prima versione di questo controllo produceva cinque volte:

        ```ts
        const SHOPIFY_DEFAULT_IDS = SHOPIFY_ORDER_LIST_COLUMN_DEFS
          .filter((c) => c.defaultVisible).map((c) => c.id);
        ```

        Non è un array di stringhe, quindi non si legge staticamente — ma prende
        le colonne accese del suo catalogo, e se QUELLO ha data e numero il preset
        li ha per costruzione. Si verifica quindi il catalogo sorgente.
      */
      const derivataDa = new RegExp(
        `(?:const|let) ${riferimento}[^=]*=\\s*(\\w+_COLUMN_DEFS)`,
      ).exec(t)?.[1];
      if (derivataDa && catalogoHaDataENumero(t, derivataDa)) {
        continue;
      }

      console.error(
        `⛔ ${nome} · ${nomeMappa} · ${quale}: punta a \`${riferimento}\`, che questa ` +
          `guardia non riesce a leggere — né come array né come derivata da un catalogo ` +
          `con data e numero.`,
      );
      difetti += 1;
    }

    for (const [, quale, lista] of corpo.matchAll(/PresetId\.(\w+)\]\s*:\s*\[([\s\S]*?)\]/g)) {
      corpoDaControllare.push([nome, nomeMappa, quale, lista]);
    }
  }
}

for (const [nome, nomeMappa, quale, lista] of corpoDaControllare) {
  {
    {
      const ids = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (ids.length === 0) {
        continue;
      }
      esaminati += 1;
      const manca = [
        !ids.some((id) => DATE.includes(id)) && 'DATA',
        !ids.some((id) => NUMERI.includes(id)) && 'NUMERO',
      ].filter(Boolean);
      if (manca.length === 0) {
        continue;
      }
      difetti += 1;
      console.error(`⛔ ${nome} · ${nomeMappa} · ${quale}: manca ${manca.join(' e ')}`);
      console.error(`     [${ids.join(', ')}]`);
    }
  }
}

if (difetti > 0) {
  console.error(
    `\n${difetti} preset documentali su ${esaminati} perdono la data o il numero.\n` +
      `Sono le due colonne che identificano una riga di registro: vanno in OGNI\n` +
      `preset, anche in quelli di analisi.`,
  );
  process.exit(1);
}

console.log(
  `check:preset-documentali — ${esaminati} preset, tutti con data e numero interno.`,
);
