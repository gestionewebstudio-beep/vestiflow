import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * ⭐ **I riepiloghi non impaginano** (`14` §H14-bis): si aprono sugli ultimi 30
 * giorni e mostrano tutto il risultato del filtro, perché l'insieme caricato
 * **è** il risultato — ed è ciò che rende onesto ordinarlo nel client.
 *
 * Il precedente è il registro movimenti, che questa forma ce l'ha da prima:
 * `inventory.service` fa `findMany` senza `take`, e il contenimento è il
 * periodo.
 *
 * ⛔ **Ma un tetto ci vuole, e deve DIRSI.** «Tutti» resta una voce
 * scegliibile: un tenant con anni di documenti alle spalle chiederebbe al
 * database di leggerli tutti e al browser di renderli. Sopra il tetto la
 * risposta si ferma e lo **dichiara nel meta** — una lista troncata in silenzio
 * è peggio di una paginata, perché sembra completa.
 */
export const UNPAGED_MAX_ROWS = 2000;

/** Mixin per i DTO di lista che sanno rispondere senza pagine. */
export class UnpagedQueryDto {
  /**
   * `all=1` — tutto il risultato del filtro, fino a `UNPAGED_MAX_ROWS`.
   *
   * ⚠️ Non `pageSize=0`: quel valore vorrebbe dire «zero righe» a chiunque lo
   * legga senza conoscere la convenzione, e la validazione lo rifiuterebbe.
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}

/** Che cosa passare a Prisma: niente `skip`/`take` quando si vuole tutto. */
export function pageWindow(query: {
  readonly all?: boolean;
  readonly page: number;
  readonly pageSize: number;
}): { skip?: number; take: number } {
  return query.all
    ? { take: UNPAGED_MAX_ROWS + 1 }
    : { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/**
 * Il `meta` della risposta senza pagine.
 *
 * ⚠️ **Si chiede una riga in più del tetto** e la si toglie qui: è il modo di
 * sapere se ce n'erano altre senza un secondo `count`, e senza mai consegnarne
 * più di quante se ne sono promesse.
 */
export function unpagedResult<T>(
  righe: readonly T[],
  total: number,
): { items: readonly T[]; total: number; page: number; pageSize: number; truncated: boolean } {
  const troncato = righe.length > UNPAGED_MAX_ROWS;
  const items = troncato ? righe.slice(0, UNPAGED_MAX_ROWS) : righe;
  return { items, total, page: 1, pageSize: items.length, truncated: troncato };
}
