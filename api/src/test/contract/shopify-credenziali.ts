import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import { ShopifyCryptoService } from '../../shopify/shopify-crypto.service';

/**
 * Credenziali per il GATE DI CONTRATTO verso Shopify.
 *
 * ⛔ **Questo è l'UNICO punto in cui una prova legge il database di sviluppo**,
 *    e la differenza con la suite di integrazione è tutta qui:
 *
 *    - l'integrazione **tronca tabelle**, quindi il suo `setup.ts` costruisce un
 *      muro perché non possa nemmeno vedere DEV;
 *    - questo gate fa **una `findFirst` e basta**: nessuna scrittura, nessuna
 *      transazione, nessun troncamento. Il token di uno shop collegato vive
 *      cifrato lì, e non esiste altrove.
 *
 * ⛔ **L'alternativa scartata era mettere il token in chiaro in `api/.env`.** Il
 *    progetto lo tiene cifrato a riposo apposta (`ShopifyCredential`,
 *    `SHOPIFY_TOKEN_ENCRYPTION_KEY`): copiarlo in chiaro per comodità di una
 *    prova sarebbe un passo indietro sulla sola cosa che quel modello protegge.
 *
 * ⚠️ **Non si decifra a mano**: si usa `ShopifyCryptoService`, lo stesso servizio
 *    dell'applicazione. Una seconda implementazione dell'AES sarebbe un secondo
 *    posto in cui sbagliare, e resterebbe indietro alla prima modifica.
 */

/** Lo stesso caricatore di `src/test/integration/setup.ts`: Vitest non legge `.env`. */
export function caricaEnvApi(): void {
  const candidati = [join(process.cwd(), '.env'), join(process.cwd(), 'api', '.env')];
  const percorso = candidati.find((p) => existsSync(p));
  if (!percorso) {
    return;
  }
  for (const rigaGrezza of readFileSync(percorso, 'utf8').split('\n')) {
    const riga = rigaGrezza.trim();
    if (!riga || riga.startsWith('#')) {
      continue;
    }
    const uguale = riga.indexOf('=');
    if (uguale <= 0) {
      continue;
    }
    const chiave = riga.slice(0, uguale).trim();
    let valore = riga.slice(uguale + 1).trim();
    if (
      (valore.startsWith('"') && valore.endsWith('"')) ||
      (valore.startsWith("'") && valore.endsWith("'"))
    ) {
      valore = valore.slice(1, -1);
    }
    if (process.env[chiave] === undefined) {
      process.env[chiave] = valore;
    }
  }
}

/**
 * ⛔ **LA PRIMA DELLE DUE CONDIZIONI PER SCRIVERE.** L'altra — `partnerDevelopment`
 *    confermato da Shopify — la verifica il file di prova, che è l'unico a poter
 *    interrogare il negozio.
 *
 * ⭐ **Sta sul TOKEN, non sulla singola scrittura**, ed è deliberato: senza
 *    credenziali non parte nemmeno una lettura, quindi non esiste un percorso
 *    che arrivi a una mutation aggirando il consenso. Metterla davanti a ogni
 *    `client.qualcosa(...)` avrebbe lasciato la porta aperta alla prossima
 *    chiamata che qualcuno dimentica di avvolgere.
 *
 * ⚠️ **Perché un flag, se lo script è già dedicato.** Lo script protegge da chi
 *    non sa; il flag protegge da chi sa e sbaglia negozio. Un domani questo
 *    comando potrebbe finire in un file di automazione, in un alias, o essere
 *    lanciato con un `.env` di produzione aperto per un'altra ragione: lì la
 *    variabile è l'unica cosa che resta a dire «sì, so che questo SCRIVE».
 */
export const VARIABILE_CONSENSO = 'SHOPIFY_CONTRACT_TEST';

export function assertGateAbilitato(): void {
  if (process.env[VARIABILE_CONSENSO] !== '1') {
    throw new Error(
      `${VARIABILE_CONSENSO} non vale «1»: il gate di contratto non parte.\n` +
        '  ⛔ Questo comando SCRIVE sul negozio Shopify collegato: crea un\n' +
        '     prodotto, tocca opzioni, varianti, giacenze e collezioni.\n' +
        `  Per eseguirlo:  ${VARIABILE_CONSENSO}=1 npm run test:shopify:contract\n` +
        '  La seconda condizione la verifica il negozio stesso: senza\n' +
        '  «partnerDevelopment: true» il gate si ferma prima di scrivere.',
    );
  }
}

export interface CredenzialiShop {
  readonly shopDomain: string;
  readonly accessToken: string;
  /** Ambiti che il negozio ha davvero concesso a QUESTO token. */
  readonly scopes: readonly string[];
}

/**
 * `ConfigService` minimo: legge l'ambiente e basta. Serve solo a costruire i
 * servizi veri senza avviare Nest, che per una prova di contratto non aggiunge
 * niente e costa un contesto intero.
 */
export function configDaAmbiente(): ConfigService {
  return { get: (chiave: string) => process.env[chiave] } as unknown as ConfigService;
}

/**
 * Il token dello shop indicato da `VESTIFLOW_SHOPIFY_CONTRACT_SHOP`.
 *
 * ⛔ **Nessun ripiego su «il primo che capita»**: con più shop collegati, una
 *    scelta implicita significherebbe scrivere su un negozio diverso da quello
 *    che si crede. Il dominio si dichiara, o il gate non parte.
 */
export async function credenzialiShop(): Promise<CredenzialiShop> {
  // ⛔ Prima di tutto: senza consenso esplicito non si ottiene nemmeno il token.
  assertGateAbilitato();

  const shopDomain = process.env['VESTIFLOW_SHOPIFY_CONTRACT_SHOP'];
  if (!shopDomain) {
    throw new Error(
      'VESTIFLOW_SHOPIFY_CONTRACT_SHOP non è impostata.\n' +
        '  Dichiara il dominio dello shop di SVILUPPO su cui eseguire il gate,\n' +
        '  per esempio  VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com\n' +
        '  ⛔ Nessun default: con più negozi collegati, sceglierne uno da soli\n' +
        '     significherebbe scrivere su quello sbagliato.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const riga = await prisma.shopifyCredential.findFirst({ where: { shopDomain } });
    if (!riga) {
      throw new Error(
        `Nessuna credenziale Shopify per «${shopDomain}».\n` +
          '  Collega lo store da Impostazioni, oppure correggi il dominio.',
      );
    }
    const crypto = new ShopifyCryptoService(configDaAmbiente());
    if (!crypto.isConfigured()) {
      throw new Error('SHOPIFY_TOKEN_ENCRYPTION_KEY non è impostata: il token non è decifrabile.');
    }
    return {
      shopDomain: riga.shopDomain,
      accessToken: crypto.decrypt(riga.accessTokenEnc),
      scopes: riga.scopes,
    };
  } finally {
    await prisma.$disconnect();
  }
}
