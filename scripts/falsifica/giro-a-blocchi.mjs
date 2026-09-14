/**
 * Falsifica le prove del GIRO A BLOCCHI di Allinea — `docs/DA-FARE.md` §31.23.
 *
 *   node scripts/falsifica/giro-a-blocchi.mjs
 *
 * ⚠️ Qui c'era `secondo-utilizzo.mjs`, che falsificava i difetti dell'operazione
 *    spalmata su più pressioni. Quel modello non esiste più — una pressione è un
 *    controllo intero — quindi quei guasti sarebbero arrivati come
 *    `ANCORA ASSENTE`: prove NON verificate con l'aria di funzionare.
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
    nome: 'K1 - il cursore salta alla fine del BLOCCO invece che all esaminata',
    file: ALIGN,
    da: '      ultima = { locationId: coppia.locationId, variantId: coppia.variantId };',
    a: '      ultima = {\n        locationId: coppie[coppie.length - 1].locationId,\n        variantId: coppie[coppie.length - 1].variantId,\n      };',
    filtro: 'il cursore punta all ULTIMA esaminata',
  },
  {
    nome: 'K2 - un blocco pieno si dichiara FINE del perimetro',
    file: ALIGN,
    da: '    const perimetroFinito = bloccoConsumato && coppie.length < ALIGN_SCAN_LIMIT;',
    a: '    const perimetroFinito = bloccoConsumato;',
    filtro: 'un errore nel mezzo NON fa dichiarare concluso',
  },
  {
    nome: 'K2b - un blocco fermato dalle scritture si dichiara CONSUMATO',
    file: ALIGN,
    da: '    const bloccoConsumato = esaminate === coppie.length;',
    a: '    const bloccoConsumato = true;',
    filtro: 'il cursore punta all ULTIMA esaminata',
  },
  {
    nome: 'K3 - la scrittura incerta si confonde con l errore di lettura',
    file: ALIGN,
    da: "    return riga?.pendingKey ? 'scrittura_esito_incerto' : 'errore_di_lettura';",
    a: "    return 'errore_di_lettura';",
    filtro: 'risposta PERSA dopo la scrittura',
  },
  {
    nome: 'L - «livello non disponibile» torna a essere un esito ignoto',
    file: ALIGN,
    da: "  level_not_found: 'livello_non_disponibile',",
    a: '',
    filtro: 'si conta per COPPIA',
  },
];

const tutti = falsificaTutti(guasti, PROVA);
process.exit(tutti && strumentoSano ? 0 : 1);
