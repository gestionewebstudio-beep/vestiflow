import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * La connessione RISERVATA al registro (`docs/DA-FARE` §10.3).
 *
 * ⛔ **Perche' esiste, misurato il 09/09/2026** (`registro-pool` P1): le
 *    scritture autonome del registro — quelle che devono sopravvivere al
 *    rollback dell'operazione, e quindi non possono stare nella sua
 *    transazione — chiedevano una connessione allo STESSO pool
 *    dell'applicazione. Con `connection_limit=5` cinque import che rifiutavano
 *    insieme si esaurivano a vicenda: cinque transazioni aperte, la sesta
 *    connessione mai concessa, tutte cadute dopo il `pool_timeout` di 10 s e
 *    ZERO righe scritte.
 *
 * ⭐ **Un solo client per istanza dell'applicazione**, non uno per richiesta:
 *    lo fornisce `PlatformAuditModule`, che e' globale. Un client per
 *    richiesta aprirebbe una connessione per richiesta, cioe' il difetto di
 *    prima moltiplicato.
 *
 * ⚠️ **Stesso database dell'operazione.** L'URL e' quella dell'applicazione con
 *    UNA sola cosa cambiata, `connection_limit=1`: host, database, credenziali,
 *    `pgbouncer`, `options` e ogni altro parametro restano quelli. Puntare
 *    altrove significherebbe un secondo database, che §10.3 esclude.
 *
 * ⛔ **Non e' un secondo registro**: e' lo stesso `PlatformAuditLog`, sulla
 *    stessa tabella dello stesso database. Cambia soltanto la connessione da
 *    cui ci si arriva.
 *
 * ⚠️ **Le scritture del registro si SERIALIZZANO** su questa connessione. Le
 *    misure sono in `registro-pool` P1: non si dichiara a priori che durino
 *    sempre pochi millisecondi — si misurano, e il numero e' un parametro, non
 *    una proprieta' della forma.
 */
@Injectable()
export class PlatformAuditPrismaClient
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasources: { db: { url: urlRiservataAlRegistro(process.env['DATABASE_URL']) } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * L'URL del client riservato: quella dell'applicazione, con il solo
 * `connection_limit` portato a uno.
 *
 * ⛔ **Lancia se `DATABASE_URL` manca**, e non ripiega su niente: un client del
 *    registro che si connettesse a un bersaglio deciso altrove sarebbe peggio
 *    di un client che non parte.
 */
export function urlRiservataAlRegistro(base: string | undefined): string {
  if (!base || base.trim() === '') {
    throw new Error(
      'DATABASE_URL assente: la connessione riservata al registro non ha un bersaglio. ' +
        'Nei test il client si passa esplicitamente al servizio.',
    );
  }
  const url = new URL(base);
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}
