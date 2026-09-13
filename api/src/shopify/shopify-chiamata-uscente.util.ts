import type { Logger } from '@nestjs/common';

/**
 * ⭐ Ogni chiamata VERSO Shopify lascia una riga di log che dice se LEGGE o
 *    SCRIVE, e che cosa. Nata nel collaudo del 13/09/2026: «l'assenza di
 *    scritture verso Shopify va misurata sulle chiamate, non dedotta dai numeri
 *    coincidenti» (proprietario). Senza questa riga i numeri uguali sui due lati
 *    non distinguono «non ha scritto» da «ha scritto lo stesso valore».
 *
 * ⚠️ Le scritture stanno al livello `log` (si vedono sempre), le letture a
 *    `debug`: in produzione le letture sono decine al minuto e non sono ciò che
 *    si va a cercare. Mai il corpo, mai il token: solo il verbo e il bersaglio.
 */
export interface ChiamataGraphql {
  readonly tipo: 'query' | 'mutation';
  readonly nome: string;
}

/** Il tipo e il primo campo di un documento GraphQL: `mutation … { inventorySetQuantities(` → mutation, inventorySetQuantities. */
export function descriviChiamataGraphql(documento: string): ChiamataGraphql {
  const testo = documento.trim();
  const tipo = /^mutation\b/.test(testo) ? 'mutation' : 'query';
  const dopoParentesi = testo.indexOf('{');
  const corpo = dopoParentesi >= 0 ? testo.slice(dopoParentesi + 1) : testo;
  const campo = /\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(corpo);
  return { tipo, nome: campo?.[1] ?? '?' };
}

const VERBI_DI_SCRITTURA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** REST: il verbo dice se scrive; `GET` legge. */
export function registraChiamataRest(
  logger: Logger,
  metodo: string | undefined,
  path: string,
): void {
  const verbo = (metodo ?? 'GET').toUpperCase();
  if (VERBI_DI_SCRITTURA.has(verbo)) {
    logger.log(`Shopify ← SCRITTURA REST ${verbo} ${path}`);
  } else {
    logger.debug(`Shopify ← lettura REST ${verbo} ${path}`);
  }
}

/** GraphQL: una `mutation` scrive, una `query` legge. */
export function registraChiamataGraphql(logger: Logger, documento: string): void {
  const { tipo, nome } = descriviChiamataGraphql(documento);
  if (tipo === 'mutation') {
    logger.log(`Shopify ← SCRITTURA GraphQL ${nome}`);
  } else {
    logger.debug(`Shopify ← lettura GraphQL ${nome}`);
  }
}
