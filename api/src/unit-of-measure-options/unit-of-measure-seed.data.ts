/**
 * Le unità proposte al primo accesso del tenant.
 *
 * Sono le stesse sei di `COMMON_UNIT_OF_MEASURE` nel frontend, dove finora
 * vivevano come costante compilata. Restano scritte due volte perché i due lati
 * non condividono codice, ma la duplicazione è **temporanea per costruzione**:
 * appena il tenant è inizializzato la fonte diventa la tabella, e la costante
 * del frontend serve solo come ripiego finché l'elenco non è arrivato.
 *
 * Misurate sul database prima di sceglierle (11/08/2026): le uniche unità
 * realmente presenti erano `pz` e `kg`, entrambe già qui dentro. Non c'era
 * niente di digitato a mano da recuperare.
 */
export const UNIT_OF_MEASURE_SEED: readonly string[] = ['pz', 'conf', 'kg', 'g', 'lt', 'm'];
