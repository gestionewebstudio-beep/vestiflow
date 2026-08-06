import type { Party } from '@prisma/client';

/**
 * Nome visualizzato del soggetto anagrafico: ragione sociale se presente,
 * altrimenti nome e cognome, con fallback su referente ed email.
 */
export function partyDisplayName(
  party: Pick<Party, 'companyName' | 'firstName' | 'lastName' | 'contactName' | 'email'>,
): string {
  const company = party.companyName?.trim();
  if (company) {
    return company;
  }
  const personal = [party.firstName, party.lastName]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
  if (personal) {
    return personal;
  }
  const contact = party.contactName?.trim();
  if (contact) {
    return contact;
  }
  return party.email?.trim() ?? '';
}
