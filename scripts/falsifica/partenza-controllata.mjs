/**
 * Falsifica le prove della PARTENZA CONTROLLATA — `docs/DA-FARE.md` §31.20.
 *
 *   node scripts/falsifica/partenza-controllata.mjs
 *
 * ⚠️ Serve il database di prova sacrificabile, non il condiviso:
 *   npm run db:test:up --prefix api  &&  npm run prisma:deploy:test --prefix api
 */
import { autoprova, dentroApi, falsificaTutti } from './falsifica.mjs';

const PUSH = dentroApi('src/shopify/shopify-inventory-push.service.ts');
const ALIGN = dentroApi('src/shopify/shopify-inventory-align.service.ts');
const PROVA = 'src/test/integration/invio-composto.integration-spec.ts';

const strumentoSano = autoprova({ file: PUSH, ancora: 'const GIRI_PRESA = 3;', prova: PROVA });

const guasti = [
  {
    nome: 'D1 - il vecchio confermato torna a certificare una partenza fallita',
    file: PUSH,
    da: `             last_pushed_available = CASE
               WHEN pending_ha_inizializzato = TRUE`,
    a: `             last_pushed_available = CASE
               WHEN FALSE`,
    filtro: 'NON certifica una partenza fallita',
  },
  {
    nome: 'D2 - il confermato si azzera SEMPRE, anche senza lavoro rimasto',
    file: PUSH,
    da: `             last_pushed_available = CASE
               WHEN pending_ha_inizializzato = TRUE
                    AND NOT (`,
    a: `             last_pushed_available = CASE
               WHEN pending_ha_inizializzato = TRUE
                    OR NOT (`,
    filtro: 'primo Allinea RIFIUTATO',
  },
  {
    nome: 'E - il tetto delle scritture torna a FERMARE il controllo',
    file: ALIGN,
    da: '    const prossimo = perimetroFinito ? null : (ultima ?? (da ?? null));',
    a: '    const prossimo =\n      perimetroFinito || scritture >= ALIGN_WRITE_LIMIT ? null : (ultima ?? (da ?? null));',
    filtro: 'un giro solo le porta TUTTE dentro',
  },
];

const tutti = falsificaTutti(guasti, PROVA);
process.exit(tutti && strumentoSano ? 0 : 1);
