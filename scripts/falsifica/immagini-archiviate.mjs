/**
 * Falsifica le prove delle IMMAGINI — `docs/DA-FARE.md` §31.27 e §31.28.
 *
 *   node scripts/falsifica/immagini-archiviate.mjs
 *
 * ⭐ Prove UNITARIE: nessun database, `config: null`.
 *
 * I guasti sono i modi in cui i difetti possono tornare:
 *
 *   1  l'import torna a non archiviare niente
 *   2  l'immagine salvata torna a essere il LINK remoto
 *   3  i reindirizzamenti tornano a seguirsi da soli
 *   4  il tetto torna a valere DOPO aver letto tutto
 *   5  un download caduto torna a far fallire l'articolo
 *   6  la guardia sugli indirizzi torna ad accettare http
 *   7  si torna a controllare solo il NOME, non la destinazione risolta
 *   8  basta un indirizzo pubblico fra i risolti
 *   9  la sincronizzazione torna a prendere la sola principale
 *  10  l'ordine delle immagini si perde, e con lui la principale
 *  11  ripetere la sincronizzazione torna a duplicare
 */
import { autoprova, dentroApi, falsificaTutti } from './falsifica.mjs';

const ARCHIVIO = dentroApi('src/media/image-archive.service.ts');
const SYNC = dentroApi('src/products/product-images.sync.ts');
const IMPORT = dentroApi('src/products/products-import.service.ts');
const INDIRIZZO = dentroApi('src/common/rete/indirizzo-remoto.util.ts');

const PROVA_ARCHIVIO = 'src/media/image-archive.service.spec.ts';
const PROVA_IMPORT = 'src/products/products-import.service.spec.ts';
const PROVA_SYNC = 'src/products/product-images.sync.spec.ts';

const strumentoSano = autoprova({
  file: ARCHIVIO,
  ancora: 'async importaImmagineDaUrl(',
  prova: PROVA_ARCHIVIO,
  config: null,
});

const guasti = [
  {
    nome: "1 - l import non archivia piu' niente",
    file: IMPORT,
    da: '    const anomalie: string[] = [];',
    a: '    const anomalie: string[] = [];\n    if (immagini.length >= 0) return anomalie;',
    filtro: 'diventa una copia in archivio',
    prova: PROVA_IMPORT,
  },
  {
    nome: '2 - si salva di nuovo il LINK remoto',
    file: ARCHIVIO,
    da: '        url: this.indirizzoPubblico(storagePath),',
    a: '        url: (origine as { url?: string }).url ?? this.indirizzoPubblico(storagePath),',
    filtro: 'usa la COPIA',
    prova: PROVA_ARCHIVIO,
  },
  {
    nome: '3 - i reindirizzamenti si seguono da soli',
    file: ARCHIVIO,
    da: "        risposta = await fetch(corrente, { redirect: 'manual', signal: scadenza });",
    a: "        risposta = await fetch(corrente, { redirect: 'follow', signal: scadenza });",
    filtro: 'il REINDIRIZZAMENTO si controlla',
    prova: PROVA_ARCHIVIO,
  },
  {
    nome: '4 - il tetto vale DOPO aver letto tutto',
    file: ARCHIVIO,
    da: ['      totale += value.byteLength;', '      if (totale > MAX_IMAGE_BYTES) {'].join('\n'),
    a: ['      totale += value.byteLength;', '      if (false) {'].join('\n'),
    filtro: 'ferma lo scaricamento MENTRE avviene',
    prova: PROVA_ARCHIVIO,
  },
  {
    nome: '5 - un download caduto fa fallire l articolo',
    file: IMPORT,
    da: '        anomalie.push(`${immagine.url.slice(0, 120)} (${motivo.slice(0, 120)})`);',
    a: '        throw errore;',
    filtro: 'le altre restano',
    prova: PROVA_IMPORT,
  },
  {
    nome: '6 - la guardia accetta di nuovo http',
    file: INDIRIZZO,
    da: "  if (url.protocol !== 'https:') {",
    a: "  if (url.protocol !== 'https:' && url.protocol !== 'http:') {",
    filtro: 'rifiuta http in chiaro',
    prova: PROVA_ARCHIVIO,
  },
  {
    nome: '7 - si torna a controllare solo il NOME',
    file: ARCHIVIO,
    da: [
      '      const destinazione = await destinazioneRisoltaPubblica(new URL(corrente).hostname);',
      '      if (!destinazione.pubblica) {',
    ].join('\n'),
    a: [
      '      const destinazione = await destinazioneRisoltaPubblica(new URL(corrente).hostname);',
      '      if (false) {',
    ].join('\n'),
    filtro: 'risolve verso la rete interna',
    prova: PROVA_ARCHIVIO,
  },
  {
    nome: '8 - basta un indirizzo pubblico fra i risolti',
    file: INDIRIZZO,
    da: '  if (interni.length > 0) {',
    a: '  if (interni.length === risolti.length) {',
    filtro: 'basta UNO degli indirizzi interno',
    prova: PROVA_ARCHIVIO,
  },

  // ── la regola nuova: TUTTE le immagini, ordine conservato, niente duplicati ──
  {
    nome: '9 - la sincronizzazione torna alla sola principale',
    file: SYNC,
    da: '  for (const remota of ordinate) {',
    a: '  for (const remota of ordinate.slice(0, 1)) {',
    filtro: 'archivia TUTTE le immagini',
    prova: PROVA_SYNC,
  },
  {
    nome: "10 - l ordine si perde, e con lui la principale",
    file: SYNC,
    da: '  const ordinate = [...immaginiRemote].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));',
    a: '  const ordinate = [...immaginiRemote];',
    filtro: 'conserva l',
    prova: PROVA_SYNC,
  },
  {
    nome: '11 - ripetere torna a duplicare',
    file: SYNC,
    da: '    if (collegate.has(gidRemoto)) {',
    a: '    if (false) {',
    filtro: 'ripetere NON duplica',
    prova: PROVA_SYNC,
  },
];

const tutti = falsificaTutti(guasti, PROVA_ARCHIVIO, null);
process.exit(tutti && strumentoSano ? 0 : 1);
