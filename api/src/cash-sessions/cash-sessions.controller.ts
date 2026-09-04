import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CashSession, CashSessionDeviceChange, CashSessionMovement } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { RequirePermissions } from '../common/auth/tenant-permissions.decorator';
import { TenantPermissionsGuard } from '../common/auth/tenant-permissions.guard';
import { CurrentTenant } from '../common/tenant/tenant.decorator';

import { CashSessionsService } from './cash-sessions.service';
import {
  CashSessionLocationQueryDto,
  CashSessionMovementDto,
  ChangeCashSessionDeviceDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

/**
 * Sessione di cassa (tranche C3): apertura, lettura, cassetto, dispositivo.
 *
 * ⛔ **Nessun verbo di cancellazione o modifica**, e non è una scelta di questo
 * file: `npm run check:cassa-append-only` fa fallire la build se compare un
 * `@Delete`, `@Put` o `@Patch`. Una sessione sbagliata si CHIUDE (C4B), un
 * movimento sbagliato si corregge con un movimento OPPOSTO.
 *
 * ⛔ **Nessuna rotta identificata dalla sola SEDE quando l'oggetto è la
 * sessione**: il vecchio ramo aveva `PUT /fiscal-devices/{locationId}`, che con
 * più dispositivi non sa quale modificare (`docs/25` §10, garanzia 7). Qui la
 * sede è una *query*, la sessione un *path parameter*.
 *
 * ⚠️ **La chiusura non c'è**, e non è dimenticata: gli attesi si calcolano
 * dalle quote di C4. C3, C4 e C4B non si rilasciano separatamente.
 */
@Controller('cash-sessions')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CashSessionsController {
  constructor(private readonly cashSessions: CashSessionsService) {}

  /** La sessione aperta di una sede, con i totali del cassetto. */
  @Get('current')
  @RequirePermissions(TenantPermission.RetailRegister)
  current(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: CashSessionLocationQueryDto,
  ): Promise<{
    session: CashSession | null;
    depositsMinor: number;
    withdrawalsMinor: number;
  }> {
    return this.cashSessions.current(tenantId, user, query.locationId);
  }

  /**
   * Apre la sessione.
   *
   * ⭐ `retail.cash_session` e non `retail.register`: aprire la cassa significa
   * dichiarare il fondo e firmare la quadratura, ed è una responsabilità
   * diversa dal vendere.
   */
  @Post('open')
  @RequirePermissions(TenantPermission.RetailCashSession)
  open(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: OpenCashSessionDto,
  ): Promise<CashSession> {
    return this.cashSessions.open(tenantId, user, dto);
  }

  /** I movimenti di cassetto della sessione. */
  @Get(':id/movements')
  @RequirePermissions(TenantPermission.RetailRegister)
  movements(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashSessionLocationQueryDto,
  ): Promise<CashSessionMovement[]> {
    return this.cashSessions.listMovements(tenantId, user, query.locationId, id);
  }

  /**
   * Versamento o prelievo.
   *
   * ⭐ `retail.cash_drawer`, distinto da `retail.cash_session`: prelevare
   * contante è più delicato che aprire, e chi sta al banco può dover aprire
   * senza poter prelevare.
   */
  @Post(':id/movements')
  @RequirePermissions(TenantPermission.RetailCashDrawer)
  addMovement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashSessionLocationQueryDto,
    @Body() dto: CashSessionMovementDto,
  ): Promise<CashSessionMovement> {
    return this.cashSessions.addMovement(tenantId, user, query.locationId, id, dto);
  }

  /** Lo storico dei cambi dispositivo della sessione. */
  @Get(':id/device-changes')
  @RequirePermissions(TenantPermission.RetailRegister)
  deviceChanges(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashSessionLocationQueryDto,
  ): Promise<CashSessionDeviceChange[]> {
    return this.cashSessions.listDeviceChanges(tenantId, user, query.locationId, id);
  }

  /**
   * Cambia il dispositivo operativo, o lo toglie con `fiscalDeviceId: null`.
   *
   * ⚠️ È un `@Post` e non un `@Patch`, e non per stile: `check:cassa-append-only`
   * vieta i verbi di modifica su questa risorsa, e il cambio dispositivo **non
   * è** una modifica della sessione — è un evento che si aggiunge allo storico
   * e di cui la sessione porta il risultato corrente.
   */
  @Post(':id/device')
  @RequirePermissions(TenantPermission.RetailCashSession)
  changeDevice(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashSessionLocationQueryDto,
    @Body() dto: ChangeCashSessionDeviceDto,
  ): Promise<{ session: CashSession; change: CashSessionDeviceChange }> {
    return this.cashSessions.changeDevice(tenantId, user, query.locationId, id, dto);
  }
}
