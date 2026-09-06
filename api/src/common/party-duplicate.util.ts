import type { Party } from '@prisma/client';

/**
 * ⭐ **I dati anagrafici di una COPIA**, comuni a clienti e fornitori.
 *
 * Deciso il 31/08/2026 insieme all'eliminazione: duplicare un'anagrafica crea una
 * scheda **nuova**, che si apre per rifinire ciò che deve essere diverso — è la
 * stessa forma del duplica prodotto, dove la copia nasce con un codice proprio e
 * senza i legami di canale dell'originale.
 *
 * ## ⛔ Che cosa NON si copia, e sono le due cose che contano
 *
 * | | |
 * | --- | --- |
 * | **partita IVA** e **codice fiscale** | ⛔ due anagrafiche con la stessa partita IVA non sono una copia: sono un **errore**. Chi duplica sta creando un soggetto diverso — una sede, una società collegata — e quei due campi sono esattamente ciò che lo distingue |
 * | identificativi di canale | il legame con Shopify appartiene all'originale: la copia è un soggetto che quel canale non conosce |
 *
 * ⚠️ **Il nome prende «(Copia)»** perché due schede identiche in un elenco non si
 * distinguono, e la prima cosa che si fa dopo un duplica è cercare quella nuova.
 *
 * ⭐ **Sta in `common/` e non in uno dei due servizi**: la `Party` è la stessa
 * struttura per entrambi i ruoli, e scrivere due volte l'elenco dei campi
 * significa che il giorno in cui se ne aggiunge uno viene copiato solo da una
 * parte — in silenzio.
 */
export function partyDuplicateData(
  party: Party,
  tenantId: string,
): {
  readonly tenantId: string;
  readonly companyName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly contactName: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly notes: string | null;
} {
  return {
    tenantId,
    /*
      ⚠️ Il suffisso va sul nome che l'elenco MOSTRA: su una ragione sociale se
      c'è, altrimenti sul cognome. Metterlo su entrambi darebbe «Rossi (Copia)
      S.r.l. (Copia)» per chi ha compilato tutti e due i campi.
    */
    companyName: conSuffisso(party.companyName),
    firstName: party.firstName,
    lastName: party.companyName ? party.lastName : conSuffisso(party.lastName),
    email: party.email,
    pec: party.pec,
    sdiCode: party.sdiCode,
    phone: party.phone,
    website: party.website,
    contactName: party.contactName,
    addressLine1: party.addressLine1,
    addressLine2: party.addressLine2,
    city: party.city,
    province: party.province,
    postalCode: party.postalCode,
    countryCode: party.countryCode,
    notes: party.notes,
  };
}

/** ⚠️ `null` resta `null`: un nome che non c'era non diventa «(Copia)». */
function conSuffisso(valore: string | null): string | null {
  return valore ? `${valore} (Copia)` : valore;
}
