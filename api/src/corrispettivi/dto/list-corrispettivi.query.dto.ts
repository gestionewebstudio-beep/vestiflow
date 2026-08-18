import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CORRISPETTIVI_AMBITO,
  CORRISPETTIVI_CANALE,
  CORRISPETTIVI_ORIGINE_VALUES,
  type CorrispettiviAmbito,
  type CorrispettiviCanale,
} from '../corrispettivi-classification.util';
import { API_FINANCIAL_VALUES } from '../../sales-orders/sales-order.enum-mapper';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tipi di riga selezionabili nel registro. `all` è il default implicito. */
export const ROW_TYPE_VALUES = ['all', 'sales', 'returns', 'refunds'] as const;
export type CorrispettiviRowTypeFilter = (typeof ROW_TYPE_VALUES)[number];

/**
 * Un parametro a lista (`a,b,c`) letto come insieme, senza ripetizioni.
 *
 * Accetta anche la forma ripetuta (`?tipi=a&tipi=b`), che è come alcuni client
 * scrivono gli array: due scritture della stessa domanda devono dare lo stesso
 * insieme, o il Registro risponderebbe diversamente a seconda di chi chiede.
 */
function toStringSet(value: unknown): string[] | undefined {
  const grezzi = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const valori = grezzi
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
  return valori.length > 0 ? [...new Set(valori)] : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

export class ListCorrispettiviQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  declare pageSize: number;
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([...API_FINANCIAL_VALUES])
  financialStatus?: string;

  /**
   * **Origine**: da cosa nasce la riga del Registro.
   *
   * ⚠️ **Sostituisce `source`, che era parziale e non lo mandava nessuno.**
   * Quel filtro ammetteva due soli valori — `online` e `pos`, cioè le due
   * origini Shopify — e non contemplava né la Vendita al banco né il
   * Corrispettivo manuale. Nessuna UI lo esponeva.
   *
   * La conseguenza misurata il 17/08/2026: **il Corrispettivo manuale non era
   * isolabile**. Condivide con la Vendita al banco la coppia Fisico/POS ·
   * VestiFlow, quindi l'unica strada — ambito + canale — le prendeva entrambe.
   *
   * I valori sono quelli che esistono davvero, derivati dalla mappa delle
   * origini: `shopify_online` · `shopify_pos` · `store` · `manual_receipt`.
   */
  @IsOptional()
  @IsIn([...CORRISPETTIVI_ORIGINE_VALUES])
  origine?: string;


  @IsOptional()
  @Matches(ISO_DATE)
  placedFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  placedTo?: string;

  /** Ambito: come è arrivata la vendita — online oppure no (`11` §5). */
  @IsOptional()
  @IsIn([...CORRISPETTIVI_AMBITO])
  ambito?: CorrispettiviAmbito;

  /** Canale: chi ha raccolto la vendita. Dimensione distinta dall’ambito. */
  @IsOptional()
  @IsIn([...CORRISPETTIVI_CANALE])
  canale?: CorrispettiviCanale;

  /**
   * Sede di cui si vuole il corrispettivo.
   *
   * ⚠️ **Le righe senza sede escono dal risultato, e la schermata lo dichiara.**
   * Non possono essere attribuite alla sede scelta, ma un Registro che perde
   * righe appena si sceglie una sede mostrerebbe un totale più basso del vero —
   * che in un registro fiscale è il difetto peggiore possibile. Il riepilogo
   * porta quindi `locationUndeterminedExcludedCount` (`10` §12).
   */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  refundsOnly?: boolean;

  /**
   * Che righe mostrare nell'elenco: tutte, le sole vendite, i soli resi, i soli
   * rimborsi senza rientro.
   *
   * ⚠️ **Filtra l'ELENCO, non il riepilogo.** Scegliendo «Resi» il totale del
   * periodo continua a dire quanto è il corrispettivo: mostrare −205,00 perché
   * si stanno guardando i resi darebbe un numero che non significa niente e che
   * qualcuno prima o poi trascriverebbe.
   */
  @IsOptional()
  @IsIn([...ROW_TYPE_VALUES])
  rowType?: string;

  // ── I filtri a INSIEME (`docs/10` §16) ──────────────────────────────────
  //
  // Origine, Tipo e Sede sono insiemi. I singolari qui sopra restano perché i
  // vecchi indirizzi continuino a funzionare: a tradurli è il parser del
  // frontend, e chi arriva qui col plurale ha già la forma definitiva.
  //
  // ⚠️ **Insieme vuoto = nessuna restrizione = TUTTI**, e il parametro non si
  // manda affatto. Un `in: []` di Prisma non significa «tutti»: significa
  // NIENTE, ed è il modo più facile di trasformare un «Tutti» in «nessuna
  // riga». I costruttori di query omettono il filtro invece di passarlo vuoto.

  /** Origini selezionate. Assente = tutte. */
  @IsOptional()
  @Transform(({ value }) => toStringSet(value))
  @IsIn([...CORRISPETTIVI_ORIGINE_VALUES], { each: true })
  origini?: string[];

  /** Tipi di evento selezionati. Assente = tutti. */
  @IsOptional()
  @Transform(({ value }) => toStringSet(value))
  @IsIn([...ROW_TYPE_VALUES], { each: true })
  tipi?: string[];

  /** Sedi selezionate. Assente = tutte. */
  @IsOptional()
  @Transform(({ value }) => toStringSet(value))
  @IsUUID('4', { each: true })
  sedi?: string[];

  /**
   * ⚠️ **«Nessun risultato», che NON è «nessuna restrizione».**
   *
   * Un vecchio indirizzo poteva contraddirsi — ambito, canale e origine erano
   * filtri indipendenti — e `?ambito=online&origine=store` rendeva zero righe.
   * Deve continuare a renderne zero.
   *
   * Ha un parametro **suo** invece di essere un `origini` vuoto: caricare
   * l'insieme vuoto di «tutti» e «niente» insieme ricreerebbe sul filo proprio
   * l'ambiguità che si sta sciogliendo, nel punto in cui è più difficile
   * accorgersene.
   *
   * **Compatibilità transitoria**: la nuova interfaccia non potrà produrlo, e
   * con i vecchi indirizzi morirà anche questo campo.
   */
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  nessunRisultato?: boolean;

  // ── Presentazione (`docs/10` §17) ────────────────────────────────────────
  //
  // ⚠️ **Questi NON sono filtri, e non devono diventarlo.** Non cambiano quali
  // righe l'insieme contiene: cambiano come si leggono. Stanno nel DTO perché
  // PDF ed Excel devono riprodurre la vista corrente — «esporta ciò che sto
  // guardando» — e la vista comprende anche il raggruppamento e le colonne.
  //
  // Il CSV li IGNORA di proposito: è l'export dati per il commercialista, una
  // riga per evento e le colonne storiche al loro posto.

  /** `none` · `day`. Assente = nessun raggruppamento. */
  @IsOptional()
  @IsIn(['none', 'day'])
  raggruppa?: string;

  /**
   * Le colonne accese nella vista, per id (`occurredAt`, `taxable`, …).
   * Assente = tutte quelle previste.
   */
  @IsOptional()
  @Transform(({ value }) => toStringSet(value))
  @IsString({ each: true })
  colonne?: string[];
}
