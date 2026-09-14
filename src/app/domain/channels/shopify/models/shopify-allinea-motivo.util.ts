import type { MotivoNonAllineataDto } from './shopify-sync.dto';

/**
 * L'etichetta breve di un motivo, per la colonna dell'elenco.
 *
 * ⭐ **Breve, non vaga.** La frase per esteso arriva dal server nel campo
 *    `dettaglio` e resta disponibile: qui serve una parola che si legga
 *    scorrendo venti righe.
 *
 * ⛔ **«Livello non disponibile» e «Errore di lettura» restano DUE voci**, come
 *    lo sono sul server: la prima è un'assenza constatata, la seconda un esito
 *    ignoto. E «Errore di lettura» non è «Scrittura con esito incerto»: nel
 *    primo caso non è partito niente, nel secondo una scrittura era prenotata.
 */
const ETICHETTE: Record<MotivoNonAllineataDto, string> = {
  livello_non_disponibile: 'Livello non disponibile',
  collegamento_escluso: 'Collegamento escluso',
  base_non_stabilita: 'Base non stabilita',
  richiesta_rifiutata: 'Richiesta rifiutata dal canale',
  divergenza_accertata: 'Divergenza accertata',
  errore_di_lettura: 'Errore di lettura',
  scrittura_esito_incerto: 'Scrittura con esito incerto',
  negozio_non_connesso: 'Negozio non connesso',
  permesso_mancante: 'Permesso mancante',
  sincronizzazione_spenta: 'Sincronizzazione spenta',
  variante_non_collegata: 'Variante non collegata',
  sede_non_collegata: 'Sede non collegata',
  stato_cambiato: 'Stato cambiato durante l’invio',
  rinvio_attivo: 'Rinvio attivo',
};

/**
 * ⚠️ **Un motivo sconosciuto non si nasconde.** Se il server ne aggiunge uno e
 *    qui manca, mostrarlo grezzo è meglio che mostrare una riga senza causa:
 *    chi legge vede che c'è qualcosa da capire, invece di una casella vuota.
 */
// ⚠️ Il parametro e' `string` e non `MotivoNonAllineataDto`, di proposito: il
//    ripiego qui sotto esiste per i motivi che il server aggiunge e questa
//    tabella non conosce ancora, e con un'unione dei due tipi non sarebbero
//    nemmeno esprimibili. I chiamanti passano comunque il tipo del DTO.
export function etichettaMotivoAllineamento(motivo: string): string {
  return ETICHETTE[motivo as MotivoNonAllineataDto] ?? motivo;
}
