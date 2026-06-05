/**
 * Stato della sessione auth.
 * - `unknown`: non ancora risolto (prima di initialize()).
 * - `authenticated`: utente loggato in memoria.
 * - `unauthenticated`: nessuna sessione attiva.
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';
