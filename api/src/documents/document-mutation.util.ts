import { ConflictException } from '@nestjs/common';

/** Il tipo store_sale/store_return è condiviso col banco: l'origine è la sessione. */
export function assertDocumentMutable(
  document: { readonly cashSessionId: string | null } | null,
): void {
  if (document?.cashSessionId) {
    throw new ConflictException({
      code: 'cash_document_immutable',
      message:
        'Un documento di Cassa registrato non si modifica né si elimina. Usa il reso di Cassa.',
    });
  }
}
