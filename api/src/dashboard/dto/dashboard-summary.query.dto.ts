import { IsOptional, IsUUID } from 'class-validator';

/** Filtri opzionali per GET /dashboard/summary. */
export class DashboardSummaryQueryDto {
  /** Se impostato, KPI giacenza limitati a questa location (topbar negozio attivo). */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
