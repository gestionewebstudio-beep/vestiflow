import { PlatformAuditActor, type PlatformAuditOperation } from '@prisma/client';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';

/**
 * Chi agisce — `docs/DA-FARE` §10.3, prima delle tre precisazioni con cui il
 * registro estende `docs/24` §7.4: **l'autore puo' essere un processo**.
 *
 * ⭐ Il tipo e' discriminato, non un oggetto con campi facoltativi: cosi' un
 *    processo NON PUO' portare un nome, e una persona non puo' non averlo. Il
 *    database ripete la stessa regola con due CHECK, perche' una regola che
 *    vale sempre va anche dove il codice non arriva.
 */
export type AttoreRegistro =
  | {
      readonly tipo: typeof PlatformAuditActor.utente;
      readonly userId: string | null;
      readonly name: string;
      readonly email: string | null;
    }
  | { readonly tipo: Exclude<PlatformAuditActor, typeof PlatformAuditActor.utente> };

/** Tutto cio' che una riga di registro conserva, meno esito e correlazione. */
export interface DatiOperazione {
  readonly tenantId: string;
  readonly attore: AttoreRegistro;
  readonly operation: PlatformAuditOperation;
  /** ⚠️ `null` finche' la fase 2 non acquisisce lo `shop_gid` (`docs/24` §8.5.8). */
  readonly shopGid?: string | null;
  readonly entityId?: string | null;
  readonly entityLabel?: string | null;
  readonly remoteGid?: string | null;
  readonly reason?: string | null;
}

/**
 * L'attore a partire dal profilo dell'utente corrente.
 *
 * ⭐ **Lo compone il CONTROLLER**, come gia' fa `actorFromProfile` per l'audit
 *    degli utenti: il service non conosce `@CurrentUser`, e non deve.
 */
/**
 * L'esito di un'operazione DENTRO la transazione del registro.
 *
 * ⭐ `ininfluente` non e' un fallimento: e' una richiesta concorrente arrivata
 *    seconda, che ha trovato l'effetto gia' applicato.
 */
export type EsitoOperazione = 'applicata' | 'ininfluente';

export function attoreDaProfilo(user: UserProfileDto): AttoreRegistro {
  return {
    tipo: PlatformAuditActor.utente,
    userId: user.id,
    name: user.displayName,
    email: user.email,
  };
}

/**
 * L'identificativo dell'utente, quando c'e'.
 *
 * ⚠️ Serve a `deleted_by_id` sul CESTINO, che e' una colonna diversa dal
 *    registro: quella si azzera al ripristino, questo no. Sono due tracce con
 *    due mestieri, e la prima non sostituisce la seconda.
 */
export function attoreUserId(attore: AttoreRegistro): string | null {
  return attore.tipo === PlatformAuditActor.utente ? attore.userId : null;
}
