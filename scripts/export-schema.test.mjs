/**
 * Prove OFFLINE del corpo prodotto da `scripts/export-schema.mjs`.
 *
 * ⛔ **Nessun database, nessuna rete, nessuna migration.** Il modulo si importa
 * senza aprire connessioni (`invocatoDirettamente`), e `componiCorpo` riceve
 * dati e ramo come parametri: qui glieli passiamo INVENTATI. Una tabella
 * applicativa senza RLS non deve esistere davvero per essere provata — e non
 * deve, visto che il database e` condiviso.
 *
 * ⭐ **Che cosa falsificano.** Il riepilogo RLS era un paragrafo FISSO:
 * dichiarava che l unica tabella senza RLS e` `_prisma_migrations` e che le
 * tabelle dichiarate sono 74. Due frasi vere il giorno in cui furono scritte, e
 * destinate a diventare false da sole: la prima al primo `ENABLE ROW LEVEL
 * SECURITY` dimenticato, la seconda alla prima tabella nuova.
 *
 * ⚠️ **Il guasto sarebbe stato MUTO**: il file avrebbe continuato a rassicurare
 * mentre l elenco, poche righe piu` sotto, marcava `RLS ASSENTE` su una tabella
 * di business. Chi legge la frase non arriva all elenco — ed e` esattamente il
 * tipo di scarto che questo progetto combatte.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { componiCorpo } from './export-schema.mjs';

/** Un ramo finto: tre tabelle dichiarate, nessuna colonna, nessuna migration. */
function ramo(tabelleAttese) {
  return {
    tabelleAttese,
    colonneAttese: new Map(tabelleAttese.map((n) => [n, []])),
    cartelleMigration: [],
  };
}

/** Dati finti: solo cio` che il riepilogo RLS guarda davvero. */
function dati(tabelle) {
  return {
    tabelle: tabelle.map((t) => ({ rls_forzata: false, ...t })),
    colonne: [],
    vincoli: [],
    indici: [],
    enumerati: [],
    storico: [],
  };
}

const PRISMA = { nome: '_prisma_migrations', rls: false };

test('⛔ una tabella APPLICATIVA senza RLS non puo` passare per _prisma_migrations', () => {
  const corpo = componiCorpo(
    dati([
      PRISMA,
      { nome: 'clienti', rls: true },
      { nome: 'ordini', rls: false },
      { nome: 'prodotti', rls: true },
    ]),
    ramo(['clienti', 'ordini', 'prodotti']),
  );

  // ⛔ Il difetto originale: il riepilogo dichiarava _prisma_migrations l unica.
  assert.doesNotMatch(corpo, /unica tabella senza RLS/i);
  // ⛔ E la tabella di business deve essere NOMINATA, dentro il perimetro.
  assert.match(corpo, /TABELLE APPLICATIVE SENZA RLS \(1\)/);
  const dentro = corpo.slice(corpo.indexOf('TABELLE APPLICATIVE SENZA RLS'));
  assert.match(dentro.split('Senza RLS e non dichiarate')[0], /\bordini\b/);
  // ⭐ E _prisma_migrations resta dove sta: fuori dal perimetro, non fra le applicative.
  assert.match(corpo, /Senza RLS e non dichiarate nello schema \(1\)/);
  assert.match(corpo, /Con RLS abilitata: 2 tabelle su 4\./);
});

test('⛔ il numero delle tabelle dichiarate viene dai DATI, non e` 74', () => {
  const corpo = componiCorpo(
    dati([PRISMA, { nome: 'clienti', rls: true }]),
    ramo(['clienti']),
  );

  assert.match(corpo, /Dichiarate nello schema Prisma: 1\./);
  // ⛔ Il numero cablato non deve comparire da nessuna parte del riepilogo.
  assert.doesNotMatch(corpo.split('TABELLE')[1] ?? '', /\b74\b/);
});

test('⭐ senza applicative scoperte lo dice, senza nominare nessuna tabella', () => {
  const corpo = componiCorpo(
    dati([PRISMA, { nome: 'clienti', rls: true }, { nome: 'ordini', rls: true }]),
    ramo(['clienti', 'ordini']),
  );

  assert.match(corpo, /Nessuna tabella DICHIARATA NELLO SCHEMA e` senza RLS\./);
  assert.doesNotMatch(corpo, /TABELLE APPLICATIVE SENZA RLS/);
  /*
    ⚠️ **Il caso comune resta descritto per QUELLO CHE E`**: `_prisma_migrations`
    finisce fra le «non dichiarate nello schema», che e` un fatto ricavato, non
    una frase che lo nomina a priori.
  */
  assert.match(corpo, /Senza RLS e non dichiarate nello schema \(1\)/);
  assert.match(corpo, /Con RLS abilitata: 2 tabelle su 3\./);
});

test('⭐ con la RLS ovunque non si inventa nessun allarme', () => {
  const corpo = componiCorpo(
    dati([
      { nome: '_prisma_migrations', rls: true },
      { nome: 'clienti', rls: true },
    ]),
    ramo(['clienti']),
  );

  assert.match(corpo, /Con RLS abilitata: 2 tabelle su 2\./);
  assert.match(corpo, /Nessuna tabella DICHIARATA NELLO SCHEMA e` senza RLS\./);
  assert.match(corpo, /Senza RLS e non dichiarate nello schema \(0\)/);
  assert.doesNotMatch(corpo, /TABELLE APPLICATIVE SENZA RLS/);
});

test('⛔ importare il modulo non apre nessuna connessione', () => {
  /*
    Se l importazione avviasse la lettura vera, questo file non sarebbe
    arrivato fin qui: senza `DIRECT_URL` uscirebbe con codice 2, e con esso
    tenterebbe una connessione al database CONDIVISO. La prova e` che i test
    sopra girano.
  */
  assert.equal(typeof componiCorpo, 'function');
});
