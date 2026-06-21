import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import type { AppError } from '@core/models/app-error.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { TikTokConnection } from '@core/models/tiktok-connection.model';
import { canManageTikTokConnection } from '@core/permissions/tenant-permissions.util';
import { formatDateTime } from '@core/utils/date.util';
import {
  tiktokConnectionStatusLabel,
  tiktokConnectionStatusTone,
} from '@features/integrations/tiktok/models/tiktok-connection-labels.util';
import { TikTokConnectionService } from '@features/integrations/tiktok/services/tiktok-connection.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: TikTokConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

type TikTokBanner = 'connected' | 'connected-warn' | 'error' | 'disconnected';

@Component({
  selector: 'app-tiktok-integration-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './tiktok-integration-panel.component.html',
  styleUrl: './tiktok-integration-panel.component.scss',
})
export class TikTokIntegrationPanelComponent {
  private readonly tiktokConnectionService = inject(TikTokConnectionService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly connectionStatusLabel = tiktokConnectionStatusLabel;
  protected readonly connectionStatusTone = tiktokConnectionStatusTone;
  protected readonly formatDateTime = formatDateTime;

  protected readonly connectLoading = signal(false);
  protected readonly disconnectLoading = signal(false);
  protected readonly clearErrorsLoading = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly tiktokBanner = signal<TikTokBanner | null>(null);

  private readonly connectionTick = signal(0);

  protected readonly canManageTikTok = computed(() =>
    canManageTikTokConnection(this.authService.currentUser()),
  );

  private readonly connectionState = toSignal(
    toObservable(this.connectionTick).pipe(
      switchMap(() =>
        this.tiktokConnectionService.getConnection().pipe(
          map((connection): ConnectionState => ({ status: 'success', connection })),
          startWith<ConnectionState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.connectionErrorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ConnectionState },
  );

  protected readonly connectionLoading = computed(
    () => this.connectionState().status === 'loading',
  );

  protected readonly connectionNotFound = computed(
    () => this.connectionState().status === 'not-found',
  );

  protected readonly connectionError = computed(() => {
    const state = this.connectionState();
    return state.status === 'error' ? state.error : null;
  });

  protected readonly connection = computed(() => {
    const state = this.connectionState();
    return state.status === 'success' ? state.connection : null;
  });

  protected readonly showClearErrors = computed(() => {
    const conn = this.connection();
    return Boolean(conn?.lastError || conn?.status === 'error');
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const tiktokParam = params.get('tiktok');
      if (
        tiktokParam === 'connected' ||
        tiktokParam === 'error' ||
        tiktokParam === 'disconnected'
      ) {
        this.handleOAuthReturn(tiktokParam);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { tiktok: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  protected reloadConnection(): void {
    this.connectionTick.update((value) => value + 1);
  }

  protected connectTikTok(): void {
    this.connectLoading.set(true);
    this.connectError.set(null);

    this.tiktokConnectionService.beginAuth().subscribe({
      next: ({ authorizeUrl }) => {
        this.connectLoading.set(false);
        window.location.assign(authorizeUrl);
      },
      error: (err: unknown) => {
        this.connectLoading.set(false);
        this.connectError.set(this.mapActionError(err));
      },
    });
  }

  protected disconnectTikTok(): void {
    this.disconnectLoading.set(true);
    this.connectError.set(null);

    this.tiktokConnectionService.disconnect().subscribe({
      next: () => {
        this.disconnectLoading.set(false);
        this.tiktokBanner.set('disconnected');
        this.reloadConnection();
      },
      error: (err: unknown) => {
        this.disconnectLoading.set(false);
        this.connectError.set(this.mapActionError(err));
      },
    });
  }

  protected clearTikTokErrors(): void {
    this.clearErrorsLoading.set(true);
    this.connectError.set(null);

    this.tiktokConnectionService.clearErrors().subscribe({
      next: () => {
        this.clearErrorsLoading.set(false);
        this.reloadConnection();
      },
      error: (err: unknown) => {
        this.clearErrorsLoading.set(false);
        this.connectError.set(this.mapActionError(err));
      },
    });
  }

  protected dismissBanner(): void {
    this.tiktokBanner.set(null);
  }

  private handleOAuthReturn(result: TikTokBanner): void {
    if (result === 'connected') {
      this.tiktokConnectionService.getConnection().subscribe({
        next: (connection) => {
          this.tiktokBanner.set(connection.lastError ? 'connected-warn' : 'connected');
          this.reloadConnection();
        },
        error: () => {
          this.tiktokBanner.set('connected');
          this.reloadConnection();
        },
      });
      return;
    }

    if (result === 'disconnected') {
      this.tiktokBanner.set('disconnected');
      this.reloadConnection();
      return;
    }

    this.tiktokConnectionService.getConnection().subscribe({
      next: (connection) => {
        this.tiktokBanner.set(connection.lastError ? 'connected-warn' : 'connected');
        this.reloadConnection();
      },
      error: () => {
        this.tiktokBanner.set('error');
        this.reloadConnection();
      },
    });
  }

  private connectionErrorToState(err: unknown): ConnectionState {
    if (isAppError(err) && err.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    if (isAppError(err)) {
      return { status: 'error', error: err };
    }
    return {
      status: 'error',
      error: {
        kind: AppErrorKind.Unknown,
        message: 'Impossibile caricare la connessione TikTok Shop.',
      },
    };
  }

  private mapActionError(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Operazione TikTok Shop non riuscita. Riprova.';
  }
}
