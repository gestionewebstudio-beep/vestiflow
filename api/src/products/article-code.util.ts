import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Codice articolo (specifica cliente §Codice articolo): identificatore
 * anagrafico interno VestiFlow. Regole condivise da TUTTI i flussi che
 * creano o modificano articoli (anagrafica, arrivo merce, import CSV,
 * sync Shopify, restore backup):
 *
 * - formato: lettere A-Z, cifre 0-9, trattino, underscore, slash. Niente
 *   spazi o altri caratteri speciali.
 * - case-insensitive: normalizzato SEMPRE in maiuscolo al salvataggio, cosi'
 *   il vincolo unico (tenant_id, article_code) garantisce l'unicita' senza
 *   confronti insensitive a runtime.
 * - obbligatorio: mai vuoto su un articolo salvato.
 * - generato come progressivo numerico con zero-padding a 5 cifre quando
 *   l'operatore/il flusso non lo fornisce; oltre 99999 espande naturalmente
 *   a 6+ cifre senza toccare i codici esistenti.
 */

export const ARTICLE_CODE_MAX_LENGTH = 50;

/** Caratteri ammessi: lettere, cifre, trattino, underscore, slash. */
const ARTICLE_CODE_PATTERN = /^[A-Za-z0-9/_-]+$/;

/** Zero-padding minimo del progressivo generato (00001, 00002, ...). */
const ARTICLE_CODE_MIN_DIGITS = 5;

export const ARTICLE_CODE_REQUIRED_MESSAGE = 'Il codice articolo è obbligatorio.';
export const ARTICLE_CODE_FORMAT_MESSAGE =
  'Il codice articolo può contenere solo lettere, numeri, trattino (-), underscore (_) e slash (/), senza spazi.';

export function articleCodeTakenMessage(productName: string): string {
  return `Codice articolo già utilizzato da ${productName}.`;
}

/** Trim + MAIUSCOLO. Vuoto/assente -> null (il chiamante decide se generare o bloccare). */
export function normalizeArticleCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

export function isValidArticleCodeFormat(value: string): boolean {
  return value.length <= ARTICLE_CODE_MAX_LENGTH && ARTICLE_CODE_PATTERN.test(value);
}

/** Formato non valido -> 422 con messaggio chiaro (specifica: errore esplicito). */
export function assertValidArticleCodeFormat(value: string): void {
  if (!isValidArticleCodeFormat(value)) {
    throw new UnprocessableEntityException(ARTICLE_CODE_FORMAT_MESSAGE);
  }
}

/** Progressivo con zero-padding a 5 cifre; oltre 99999 espande da solo (100000...). */
export function formatArticleCodeProgressive(sequence: number): string {
  return String(sequence).padStart(ARTICLE_CODE_MIN_DIGITS, '0');
}

/**
 * Unicita' per tenant, tx-aware. Confronto case-insensitive per difendersi
 * da eventuali dati legacy non ancora normalizzati. In caso di conflitto:
 * 409 con il nome dell'articolo che possiede il codice (specifica §univoco).
 */
export async function assertArticleCodeAvailableInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  articleCode: string,
  excludeProductId?: string,
): Promise<void> {
  const existing = await tx.product.findFirst({
    where: {
      tenantId,
      articleCode: { equals: articleCode, mode: 'insensitive' },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
    select: { name: true },
  });
  if (existing) {
    throw new ConflictException(articleCodeTakenMessage(existing.name));
  }
}

/**
 * Prossimo progressivo libero del tenant, tx-aware. Prende un advisory lock
 * transazionale per tenant PRIMA di leggere il massimo: due creazioni
 * concorrenti sullo stesso tenant vengono serializzate e non possono
 * generare lo stesso codice (il lock si rilascia al commit/rollback della
 * transazione). Considera solo i codici interamente numerici: i codici
 * manuali alfanumerici non influenzano il progressivo.
 */
export async function nextArticleCodeInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  // Cast ::text obbligatorio: pg_advisory_xact_lock restituisce `void`, che
  // Prisma non sa deserializzare — senza cast la generazione del progressivo
  // fallisce con 500 «Failed to deserialize column of type 'void'».
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('product_article_code'), hashtext(${tenantId}))::text`;
  const rows = await tx.$queryRaw<{ article_code: string }[]>`
    SELECT article_code
    FROM products
    WHERE tenant_id = ${tenantId}::uuid
      AND article_code ~ '^[0-9]+$'
    ORDER BY LENGTH(article_code) DESC, article_code DESC
    LIMIT 1
  `;
  const maxNumeric = rows[0] ? Number.parseInt(rows[0].article_code, 10) : 0;
  return formatArticleCodeProgressive(maxNumeric + 1);
}

/**
 * Risolve il codice articolo in creazione (regola generale valida per TUTTI
 * i flussi, §IMPORTAZIONI MASSIVE): fornito e valido -> normalizzato e
 * verificato univoco; assente -> progressivo generato. Ritorna il codice
 * pronto per l'insert.
 */
export async function resolveArticleCodeForCreateInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  provided: string | null | undefined,
): Promise<string> {
  const normalized = normalizeArticleCode(provided);
  if (normalized) {
    assertValidArticleCodeFormat(normalized);
    await assertArticleCodeAvailableInTx(tx, tenantId, normalized);
    return normalized;
  }
  return nextArticleCodeInTx(tx, tenantId);
}
