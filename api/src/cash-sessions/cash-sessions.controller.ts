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

import { CashCheckoutService, type CheckoutResult } from './cash-checkout.service';
import { CashClosingService, type CloseResult } from './cash-closing.service';
import {
  CashOperationsService,
  type OperationDetail,
  type OperationsPage,
  type ReceiptSearchResult,
} from './cash-operations.service';
import {
  CashReturnService,
  type ReturnLookupResult,
  type ReturnResult,
  type ReturnPreviewResult,
} from './cash-return.service';
import {
  CashSessionsReportService,
  type SessionDetail,
  type SessionsPage,
} from './cash-sessions-report.service';
import { CashSessionsService } from './cash-sessions.service';
import {
  CashCheckoutDto,
  CashOperationsQueryDto,
  CashReturnDto,
  CashReturnPreviewDto,
  CashSessionsQueryDto,
  CashSessionLocationQueryDto,
  CashSessionMovementDto,
  ChangeCashSessionDeviceDto,
  CloseCashSessionDto,
  OpenCashSessionDto,
  ReceiptSearchQueryDto,
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
 * ⭐ **La chiusura c’è da C4B** (`POST :id/close`), e congela gli attesi
 * calcolati dalle quote: prima di C4 non erano calcolabili.
 */
@Controller('cash-sessions')
@UseGuards(JwtAuthGuard, TenantPermissionsGuard)
export class CashSessionsController {
  constructor(
    private readonly cashSessions: CashSessionsService,
    private readonly checkoutService: CashCheckoutService,
    private readonly returnService: CashReturnService,
    private readonly closingService: CashClosingService,
    private readonly operations: CashOperationsService,
    private readonly sessionsReport: CashSessionsReportService,
  ) {}

  // ── Consultazione ────────────────────────────────────────────────────────
  //
  // ⛔ Le rotte STATICHE stanno prima di quelle con `:id`, e non e` stile:
  //    Nest confronta in ordine di dichiarazione, e `@Get(':id/movements')`
  //    catturerebbe `operations` come identificativo di sessione.

  /**
   * Il **registro operativo**: vendite e resi di Cassa, con i totali dello
   * stesso filtro.
   *
   * ⛔ Non e` il Registro corrispettivi, che resta contabile e riceve queste
   * stesse operazioni per un_altra strada (`docs/25` §13-septies).
   */
  @Get('operations')
  @RequirePermissions(TenantPermission.RetailRegister)
  operationsList(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: CashOperationsQueryDto,
  ): Promise<OperationsPage> {
    return this.operations.list(tenantId, user, query);
  }

  /** Il dettaglio di un_operazione: righe, quote, resto, movimenti, resi. */
  @Get('operations/:id')
  @RequirePermissions(TenantPermission.RetailRegister)
  operationDetail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperationDetail> {
    return this.operations.detail(tenantId, user, id);
  }

  /**
   * La ricerca dello scontrino da rendere, **senza UUID**.
   *
   * ⚠️ Cerca nei documenti di VestiFlow. Non nel registratore e non
   * all_Agenzia: quelle strade appartengono a C5 e non esistono.
   */
  @Get('returns/search')
  @RequirePermissions(TenantPermission.RetailCashReturn)
  searchReceipts(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: ReceiptSearchQueryDto,
  ): Promise<readonly ReceiptSearchResult[]> {
    return this.operations.searchReceipts(tenantId, user, query);
  }

  /** Le sessioni, aperte e chiuse. */
  @Get('sessions')
  @RequirePermissions(TenantPermission.RetailRegister)
  sessionsList(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Query() query: CashSessionsQueryDto,
  ): Promise<SessionsPage> {
    return this.sessionsReport.list(tenantId, user, query);
  }

  /** Il dettaglio della sessione: quadratura, movimenti, documenti, storico. */
  @Get('sessions/:id')
  @RequirePermissions(TenantPermission.RetailRegister)
  sessionDetail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionDetail> {
    return this.sessionsReport.detail(tenantId, user, id);
  }

  /**
   * Conclude una vendita di cassa (tranche C4A).
   *
   * ⭐ `retail.register`: e' una VENDITA, e la fa chi sta al banco. Aprire la
   * cassa e' un'altra responsabilita', e ha il permesso suo.
   *
   * ⛔ Il documento nasce CONFERMATO e immutabile: non esiste una rotta che
   * lo riapra, e la modifica documentale della Vendita al banco passa da un
   * altro servizio e da un'altra rotta.
   */
  @Post('checkout')
  @RequirePermissions(TenantPermission.RetailRegister)
  checkout(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CashCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.checkoutService.checkout(tenantId, user, dto);
  }

  /**
   * Il richiamo dello scontrino: la vendita originale, con quanto e` gia`
   * stato reso riga per riga.
   */
  @Get('returns/lookup/:documentId')
  @RequirePermissions(TenantPermission.RetailCashReturn)
  lookupReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: CashSessionLocationQueryDto,
  ): Promise<ReturnLookupResult> {
    return this.returnService.lookup(tenantId, user, query.locationId, documentId);
  }

  /**
   * Il reso collegato allo scontrino.
   *
   * ⭐ `retail.cash_return`, distinto da `retail.register`: restituire denaro
   * non e` vendere, ed e` la prima operazione della Cassa che fa USCIRE
   * valore.
   */
  @Post('returns')
  @RequirePermissions(TenantPermission.RetailCashReturn)
  createReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CashReturnDto,
  ): Promise<ReturnResult> {
    return this.returnService.createReturn(tenantId, user, dto);
  }

  @Post('returns/preview')
  @RequirePermissions(TenantPermission.RetailCashReturn)
  previewReturn(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Body() dto: CashReturnPreviewDto,
  ): Promise<ReturnPreviewResult> {
    return this.returnService.preview(tenantId, user, dto);
  }

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

  /**
   * Chiude la sessione e CONGELA la quadratura (tranche C4B).
   *
   * ⭐ `retail.cash_session`, lo stesso permesso dell_apertura: chi dichiara
   * il fondo e` chi firma la quadratura.
   *
   * ⚠️ E` un `@Post` e non un `@Patch`: `check:cassa-append-only` vieta i
   * verbi di modifica su questa risorsa. La chiusura non e` una modifica
   * della sessione — e` il suo evento finale, e non si annulla.
   */
  @Post(':id/close')
  @RequirePermissions(TenantPermission.RetailCashSession)
  close(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: UserProfileDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CashSessionLocationQueryDto,
    @Body() dto: CloseCashSessionDto,
  ): Promise<CloseResult> {
    return this.closingService.close(tenantId, user, query.locationId, id, dto);
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
