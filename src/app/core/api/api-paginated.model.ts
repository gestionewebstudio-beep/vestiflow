/** Risposta paginata NestJS (`Paginated<T>`). */
export interface ApiPaginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Presente solo sulle liste senza pagine, quando il tetto ha tagliato. */
  readonly truncated?: boolean;
}
