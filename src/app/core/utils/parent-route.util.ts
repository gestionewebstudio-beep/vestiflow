/**
 * Rotta "padre" ricavata dall'URL corrente: serve al pulsante «Indietro»
 * quando manca la cronologia interna dell'app — tipicamente dopo un refresh,
 * che azzera le navigazioni del Router. Senza, il pulsante spariva e la pagina
 * restava senza via d'uscita se non la barra del browser.
 *
 * Regola: si risale scartando le code che non sono una pagina a sé — le azioni
 * (`edit`, `new`) e gli identificativi — fino alla prima sezione vera.
 */

const ACTION_SEGMENTS: ReadonlySet<string> = new Set(['edit', 'new', 'print', 'print-label']);

/** Un segmento id (uuid o numerico lungo) non è una pagina navigabile. */
function isIdSegment(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^\d{6,}$/.test(segment);
}

/**
 * Rotta di ritorno per `url`, oppure null se non esiste un livello superiore
 * dentro l'app (es. si è già su una voce di primo livello come la dashboard).
 */
export function parentRoute(url: string): string | null {
  const path = url.split('?')[0]!.split('#')[0]!;
  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'app') {
    return null;
  }

  const rest = segments.slice(1);
  while (rest.length > 0) {
    const last = rest[rest.length - 1]!;
    if (!ACTION_SEGMENTS.has(last) && !isIdSegment(last)) {
      break;
    }
    rest.pop();
  }

  // Serve almeno una sezione oltre alla radice, e non deve essere la pagina
  // stessa: se non abbiamo scartato nulla, il padre è un livello più su.
  if (rest.length === segments.length - 1) {
    rest.pop();
  }
  return rest.length > 0 ? `/app/${rest.join('/')}` : null;
}
