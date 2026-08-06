import { DocumentType } from '@prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MovementDocumentReferenceSource {
  readonly externalRef: string | null;
  readonly sourceDocumentId: string | null;
  readonly sourceDocumentType: DocumentType | null;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Id documento validi per lookup Prisma (esclude GID Shopify e ref testuali). */
export function collectDocumentLookupIds(
  movements: readonly MovementDocumentReferenceSource[],
): readonly string[] {
  const ids = new Set<string>();
  for (const movement of movements) {
    if (
      movement.sourceDocumentId &&
      movement.sourceDocumentType !== DocumentType.online_sale
    ) {
      ids.add(movement.sourceDocumentId);
    }
    if (movement.externalRef && isUuid(movement.externalRef)) {
      ids.add(movement.externalRef);
    }
  }
  return [...ids];
}

export function collectOnlineSaleLookupIds(
  movements: readonly MovementDocumentReferenceSource[],
): readonly string[] {
  const ids = new Set<string>();
  for (const movement of movements) {
    if (
      movement.sourceDocumentType === DocumentType.online_sale &&
      movement.sourceDocumentId
    ) {
      ids.add(movement.sourceDocumentId);
    }
  }
  return [...ids];
}

export function resolveMovementDocumentReference(
  movement: MovementDocumentReferenceSource,
  documentRefById: ReadonlyMap<string, string | null>,
  onlineSaleRefById: ReadonlyMap<string, string>,
): string | null {
  if (
    movement.sourceDocumentType === DocumentType.online_sale &&
    movement.sourceDocumentId
  ) {
    return (
      onlineSaleRefById.get(movement.sourceDocumentId) ??
      movement.externalRef ??
      null
    );
  }

  if (movement.sourceDocumentId) {
    return documentRefById.get(movement.sourceDocumentId) ?? null;
  }

  if (!movement.externalRef) {
    return null;
  }

  return documentRefById.get(movement.externalRef) ?? movement.externalRef;
}
