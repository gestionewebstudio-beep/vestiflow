/**
 * Falsifica le prove del SECONDO UTILIZZO di Allinea — `docs/DA-FARE.md` §31.21.
 *
 *   node scripts/falsifica/secondo-utilizzo.mjs
 *
 * ⚠️ Serve il database di prova sacrificabile, non il condiviso:
 *   npm run db:test:up --prefix api  &&  npm run prisma:deploy:test --prefix api
 */
import { autoprova, dentroApi, falsificaTutti } from './falsifica.mjs';

const ALIGN = dentroApi('src/shopify/shopify-inventory-align.service.ts');
const PROVA = 'src/test/integration/invio-composto.integration-spec.ts';

const strumentoSano = autoprova({
  file: ALIGN,
  ancora: 'const ALIGN_WRITE_LIMIT = 50;',
  prova: PROVA,
});

const guasti = [
  {
    nome: 'G1 - «non verificate» torna a essere «mai guardate»',
    file: ALIGN,
    da: '         AND (s.last_attempt_at IS NULL OR s.last_attempt_at < ${dalle})`;',
    a: '         AND s.last_attempt_at IS NULL`;',
    filtro: 'dichiara finito troppo presto',
  },
  {
    nome: 'G2 - «interrotto» torna a dire «ho riempito il tetto di scansione»',
    file: ALIGN,
    da: '      interrotto: scritture >= ALIGN_WRITE_LIMIT || nonEsaminate > 0,',
    a: '      interrotto: scritture >= ALIGN_WRITE_LIMIT || coppie.length === ALIGN_SCAN_LIMIT,',
    filtro: 'dichiara finito troppo presto',
  },
  {
    nome: 'H1 - il residuo dimentica il rifiuto del canale',
    file: ALIGN,
    da: '           OR s.mismatch_detected = TRUE\n',
    a: '',
    filtro: 'non sparisce dal residuo',
  },
  {
    nome: 'H2 - il residuo torna a leggersi dalla sola passata di adesso',
    file: ALIGN,
    da: '    const restano = await this.contaNonAPosto(tenantId, daRiprendere);',
    a: '    const restano = senzaBase + daRiprendere.length;',
    filtro: 'non sparisce dal residuo',
  },
];

const tutti = falsificaTutti(guasti, PROVA);
process.exit(tutti && strumentoSano ? 0 : 1);
