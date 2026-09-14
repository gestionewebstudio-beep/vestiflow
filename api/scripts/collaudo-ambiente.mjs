/**
 * L'ambiente con cui si AVVIA un'istanza del collaudo: composto in modo che a
 * valere sia SOLO il file del collaudo, qualunque cosa faccia chi carica
 * `.env` per conto suo.
 *
 * ⛔ Misurato il 12/09/2026 sera, a collaudo in corso: `start:collaudo` toglieva
 *    dall'ambiente ereditato le chiavi del file di collaudo e lasciava che
 *    `ConfigModule` leggesse il file. Ma il client Prisma GENERATO, al primo
 *    `require`, chiama `warnEnvConflicts` → `tryLoadEnvs` con
 *    `schemaEnvPath: '../../../.env'` = **`api/.env`**, e lo carica in
 *    `process.env` per ogni chiave NON ancora definita — cioè esattamente
 *    quelle appena tolte. `ConfigModule` dà poi la precedenza a `process.env`
 *    sul file: l'API «di collaudo» girava con `DATABASE_URL` del CONDIVISO,
 *    `CORS_ORIGINS` di sviluppo (4200/4210: il login dal 4212 falliva per CORS,
 *    ed è così che si è visto), `SHOPIFY_APP_URL` localhost:3000, chiave token
 *    di sviluppo. Sul 5434 nessuna connessione dell'API; su `PORT`, che in
 *    `api/.env` non c'è, il file del collaudo valeva — e la porta 3100 faceva
 *    sembrare tutto giusto.
 *
 * ⭐ La difesa è il contrario di quella di prima: le chiavi del collaudo si
 *    METTONO nell'ambiente del figlio (dotenv non sovrascrive mai una chiave
 *    già definita), e ogni chiave che `api/.env` dichiara e il collaudo no si
 *    definisce VUOTA, così nessun valore di sviluppo può entrare da lì.
 *    ⚠️ Un valore vuoto è «definito» per dotenv e «assente» per l'API
 *    (`@IsOptional`): è la coppia che serve.
 */

/**
 * @param {NodeJS.ProcessEnv} ereditato   l'ambiente della shell che avvia
 * @param {Record<string,string>} collaudo le chiavi del file del collaudo
 * @param {Iterable<string>} chiaviSviluppo i NOMI delle chiavi di `api/.env`
 *   (mai i valori: qui non servono e non devono passare)
 * @param {string} fileCollaudo nome del file che `ConfigModule` leggerà
 */
export function componiAmbienteCollaudo(ereditato, collaudo, chiaviSviluppo, fileCollaudo) {
  const ambiente = { ...ereditato };
  for (const chiave of chiaviSviluppo) {
    if (!(chiave in collaudo)) {
      ambiente[chiave] = '';
    }
  }
  for (const [chiave, valore] of Object.entries(collaudo)) {
    ambiente[chiave] = valore;
  }
  ambiente['VESTIFLOW_ENV_FILE'] = fileCollaudo;
  return ambiente;
}

/**
 * Le prove che un'istanza avviata così deve superare, per chi le esegue a mano
 * dopo l'avvio (non sono deducibili dal file: vanno misurate sul processo):
 *  - `pg_stat_activity` del 5434 mostra la connessione dell'API;
 *  - una preflight CORS con `Origin: <FRONTEND_URL del collaudo>` riceve
 *    `Access-Control-Allow-Origin`, e una con l'origine di sviluppo NO.
 */
export const PROVE_DOPO_AVVIO = ['pg_stat_activity sul 5434', 'preflight CORS 4212 sì, 4200 no'];
