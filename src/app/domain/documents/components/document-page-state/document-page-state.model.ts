/**
 * Gli stati in cui una maschera documento può trovarsi PRIMA di mostrare il
 * documento.
 *
 * ⭐ Non è un vocabolario nuovo: è quello che tutte e sette le maschere già
 * calcolano in un segnale `loadState`, con le stesse quattro parole. Il
 * componente comune lo riceve, non lo reinventa.
 */
export type DocumentPageState = 'loading' | 'error' | 'not-found' | 'ready';
