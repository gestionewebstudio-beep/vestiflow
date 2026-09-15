import type { Prisma, PrismaClient } from '@prisma/client';

/** Un client Prisma o la transazione in corso: la guardia legge la corsia con quello che ha in mano. */
export type ClientCorsia = Prisma.TransactionClient | PrismaClient;

/**
 * La rivendicazione della corsia non è più di chi la porta: un altro lavoratore
 * l'ha presa (lease scaduta). Chi la riceve NON scrive più niente e si ferma.
 */
export class CorsiaWebhookSuperataException extends Error {
  constructor(
    readonly tenantId: string,
    readonly versione: number,
  ) {
    super(`Corsia webhook del tenant ${tenantId} superata (versione ${versione})`);
    this.name = 'CorsiaWebhookSuperataException';
  }
}

/**
 * La GUARDIA DI PROPRIETÀ del lavoratore della coda webhook (docs/30 §7.1.1, §7.1.2 D3/D4).
 *
 * ⭐ La scadenza della lease permette a un altro lavoratore di rivendicare la corsia;
 *    non dimostra che il precedente sia morto — può essere solo lento (una chiamata a
 *    Shopify appesa). Per questo ogni transazione di effetto e ogni chiamata remota
 *    del lavoratore ricontrollano la versione: chi è stato superato abortisce PRIMA
 *    di scrivere. Dentro una transazione la lettura è `FOR UPDATE`, quindi la
 *    versione non cambia fra il controllo e il commit.
 *
 * ⚠️ È una guardia per la corsia, non un lucchetto sui dati: l'idempotenza degli
 *    effetti (chiave degli eventi ordine, `updated_at` del canale, chiave delle
 *    quantità) resta necessaria e non viene sostituita.
 */
export interface GuardiaCorsia {
  readonly tenantId: string;
  readonly versione: number;
  /** Lancia `CorsiaWebhookSuperataException` se la corsia non è più di questa versione. */
  assicura(client: ClientCorsia): Promise<void>;
}

/** La versione corrente della corsia; `FOR UPDATE` dentro una transazione, per tenerla ferma fino al commit. */
export async function versioneDellaCorsia(
  client: ClientCorsia,
  tenantId: string,
  perAggiornamento: boolean,
): Promise<number | null> {
  const righe = perAggiornamento
    ? await client.$queryRaw<{ claim_version: number }[]>`
        SELECT "claim_version" FROM "shopify_webhook_lanes" WHERE "tenant_id" = ${tenantId}::uuid FOR UPDATE`
    : await client.$queryRaw<{ claim_version: number }[]>`
        SELECT "claim_version" FROM "shopify_webhook_lanes" WHERE "tenant_id" = ${tenantId}::uuid`;
  return righe[0]?.claim_version ?? null;
}

export function guardiaDellaCorsia(tenantId: string, versione: number): GuardiaCorsia {
  return {
    tenantId,
    versione,
    async assicura(client: ClientCorsia): Promise<void> {
      const perAggiornamento = !('$transaction' in client);
      const corrente = await versioneDellaCorsia(client, tenantId, perAggiornamento);
      if (corrente !== versione) {
        throw new CorsiaWebhookSuperataException(tenantId, versione);
      }
    },
  };
}
