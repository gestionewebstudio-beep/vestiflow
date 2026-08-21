import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * ⭐ **I riepiloghi non impaginano** (`14` §H14-bis): si aprono sugli ultimi 30
 * giorni e mostrano tutto il risultato del filtro, perché l'insieme caricato
 * **è** il risultato — ed è ciò che rende onesto ordinarlo nel client.
 *
 * ## ⛔ E non c'è un tetto sulle righe
 *
 * _Deciso dal proprietario il 21/08/2026._ Qui c'era un tetto da 2.000 righe con
 * troncamento dichiarato nel `meta`, e **è stato tolto**:
 *
 * > _«Troppo complesso. Per il momento deve essere semplice: il riepilogo apre
 * > secondo le regole di default e non ancora con limiti. Per regolare il
 * > flusso, dove possibile, stiamo aprendo le maschere con i filtri applicati
 * > periodici.»_
 *
 * ⭐ **Il contenimento è il PERIODO, non un numero di righe.** Un elenco che si
 * apre sugli ultimi 30 giorni è già delimitato da qualcosa che l'operatore
 * capisce e può cambiare; un tetto sul conteggio è una seconda regola, con un
 * suo avviso, un suo campo nel contratto e un suo caso limite — per un problema
 * che oggi nessuno ha misurato.
 *
 * ⚠️ Resta il tetto del **Registro Corrispettivi** (`REGISTER_MERGE_CEILING`),
 * che è un'altra cosa e preesisteva: là cinque sorgenti si fondono in memoria, e
 * quella è una rete che non si vede finché non serve — non un comportamento che
 * l'operatore incontra.
 */
export class UnpagedQueryDto {
  /** `all=1` — tutto il risultato del filtro. */
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
}): { skip?: number; take?: number } {
  return query.all ? {} : { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
