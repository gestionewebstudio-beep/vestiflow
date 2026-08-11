import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { UserRole } from '@core/models/user.model';
import {
  DOCUMENT_FAMILY_LABELS,
  DOCUMENT_PERMISSION_FAMILIES,
  TENANT_PERMISSION_DEFINITIONS,
  TENANT_PERMISSION_GROUP_LABELS,
  docManagePermission,
  docViewPermission,
} from '@core/models/tenant-permission.model';
import { resolveEffectivePermissions } from '@core/permissions/user-permissions.util';
import { isAppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import type { TenantUser } from '@domain/users/models/tenant-user.model';

import type { TenantActiveLocation } from '../../models/admin-tenant.model';
import { TENANT_ROLE_OPTIONS, tenantRoleLabel } from '../../models/admin-tenant-role.util';
import { AdminTenantsService } from '../../services/admin-tenants.service';

interface PermissionItemView {
  readonly label: string;
  /** Solo matrice documenti: livello di accesso alla famiglia. */
  readonly level?: 'consulta' | 'gestisce';
}

interface PermissionGroupView {
  readonly label: string;
  /** Guida il rendering: le sezioni come chip, il resto come elenco. */
  readonly kind: 'sections' | 'documents' | 'actions';
  readonly items: readonly PermissionItemView[];
}

/**
 * Pannello utenti del cliente lato admin piattaforma. Decisione di prodotto
 * (2026-08-11): i DIPENDENTI li gestisce il titolare — qui sono in sola
 * lettura (diagnosi permessi inclusa); l'admin crea e amministra i soli
 * account TITOLARE. Per intervenire su un dipendente: sessione assistenza,
 * dalla pagina Impostazioni → Utenti del cliente. L'API rifiuta comunque le
 * mutazioni sui dipendenti da questa superficie.
 */
@Component({
  selector: 'app-admin-tenant-users-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, InlineSpinnerComponent, SelectMenuComponent],
  templateUrl: './admin-tenant-users-panel.component.html',
  styleUrl: './admin-tenant-users-panel.component.scss',
})
export class AdminTenantUsersPanelComponent {
  private readonly adminTenants = inject(AdminTenantsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly tenantId = input.required<string>();
  readonly activeLocations = input.required<readonly TenantActiveLocation[]>();

  protected readonly UserRole = UserRole;
  protected readonly tenantRoleLabel = tenantRoleLabel;
  /** Ruoli selezionabili sull'account titolare (il declassamento fa parte del passaggio di proprietà). */
  protected readonly roleOptions = TENANT_ROLE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  protected readonly users = signal<readonly TenantUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly createLoading = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createSuccess = signal(false);
  protected readonly rowSavingId = signal<string | null>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly expandedPermissionsUserId = signal<string | null>(null);
  protected readonly createFormOpen = signal(false);

  protected readonly locationOptions = computed(() =>
    this.activeLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  /** Creazione da questa superficie: SOLO account titolare (nome, email, password). */
  protected readonly createForm = this.fb.group({
    displayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    email: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
  });

  constructor() {
    effect(() => {
      const tenantId = this.tenantId();
      if (!tenantId) {
        return;
      }
      this.loadUsers(tenantId);
    });
  }

  protected isOwnerRole(role: UserRole): boolean {
    return role === UserRole.Owner;
  }

  /** Sedi assegnate del dipendente, in chiaro (sola lettura). */
  protected assignedLocationsLabel(user: TenantUser): string {
    if (user.hasAllLocationsAccess || this.isOwnerRole(user.role)) {
      return 'Tutte le sedi';
    }
    if (user.assignedLocations.length === 0) {
      return '—';
    }
    return user.assignedLocations.map((location) => location.name).join(', ');
  }

  /** Permessi effettivi raggruppati, per la diagnosi in sola lettura. */
  protected permissionGroupsFor(user: TenantUser): readonly PermissionGroupView[] {
    const effective = new Set(
      resolveEffectivePermissions({ role: user.role, permissions: [...user.permissions] }),
    );

    // Sezioni come chip: il titolo del gruppo dice già «Sezioni», il prefisso
    // ripetuto su ogni voce sarebbe rumore.
    const sectionItems: PermissionItemView[] = TENANT_PERMISSION_DEFINITIONS.filter(
      (definition) => definition.group === 'sections' && effective.has(definition.key),
    ).map((definition) => ({ label: definition.label.replace(/^Sezione\s+/, '') }));

    // Matrice documenti: una voce per famiglia visibile, con il livello a pill.
    const documentItems: PermissionItemView[] = [];
    for (const family of DOCUMENT_PERMISSION_FAMILIES) {
      const manages = effective.has(docManagePermission(family));
      const views = manages || effective.has(docViewPermission(family));
      if (!views) {
        continue;
      }
      documentItems.push({
        label: DOCUMENT_FAMILY_LABELS[family],
        level: manages ? 'gestisce' : 'consulta',
      });
    }

    const actionGroups = new Map<string, PermissionItemView[]>();
    for (const definition of TENANT_PERMISSION_DEFINITIONS) {
      if (definition.group === 'sections' || !effective.has(definition.key)) {
        continue;
      }
      const label = TENANT_PERMISSION_GROUP_LABELS[definition.group];
      const bucket = actionGroups.get(label);
      if (bucket) {
        bucket.push({ label: definition.label });
      } else {
        actionGroups.set(label, [{ label: definition.label }]);
      }
    }

    const result: PermissionGroupView[] = [];
    if (sectionItems.length > 0) {
      result.push({ label: 'Sezioni', kind: 'sections', items: sectionItems });
    }
    if (documentItems.length > 0) {
      result.push({ label: 'Documenti', kind: 'documents', items: documentItems });
    }
    for (const [label, items] of actionGroups) {
      result.push({ label, kind: 'actions', items });
    }
    return result;
  }

  protected togglePermissionsPanel(userId: string): void {
    this.expandedPermissionsUserId.update((current) => (current === userId ? null : userId));
  }

  protected permissionsExpanded(userId: string): boolean {
    return this.expandedPermissionsUserId() === userId;
  }

  protected toggleCreateForm(): void {
    if (this.createFormOpen()) {
      this.closeCreateForm();
      return;
    }
    this.createFormOpen.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);
  }

  protected closeCreateForm(): void {
    this.createFormOpen.set(false);
    this.createError.set(null);
  }

  /** Cambio ruolo sull'account titolare (declassamento nel passaggio di proprietà). */
  protected onOwnerRoleSelect(user: TenantUser, value: string | null): void {
    if (!value || !this.isUserRole(value) || value === user.role) {
      return;
    }
    this.saveUser(user, { role: value });
  }

  protected onOwnerDefaultLocationSelect(user: TenantUser, value: string | null): void {
    const next = value || null;
    if (next === user.defaultLocationId) {
      return;
    }
    this.saveUser(user, { defaultLocationId: next });
  }

  protected submitCreate(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid || this.createLoading()) {
      return;
    }

    const raw = this.createForm.getRawValue();
    this.createLoading.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    this.adminTenants
      .createTenantUser(this.tenantId(), {
        displayName: raw.displayName.trim(),
        email: raw.email.trim(),
        password: raw.password,
        role: UserRole.Owner,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.createLoading.set(false);
          this.createSuccess.set(true);
          this.createFormOpen.set(false);
          this.createForm.reset({ displayName: '', email: '', password: '' });
          this.loadUsers(this.tenantId());
        },
        error: (err: unknown) => {
          this.createLoading.set(false);
          this.createError.set(isAppError(err) ? err.message : 'Creazione titolare non riuscita.');
        },
      });
  }

  private saveUser(
    user: TenantUser,
    patch: { role?: UserRole; defaultLocationId?: string | null },
  ): void {
    if (this.rowSavingId()) {
      return;
    }
    this.rowSavingId.set(user.id);
    this.rowError.set(null);

    this.adminTenants
      .updateTenantUser(this.tenantId(), user.id, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.rowSavingId.set(null);
          this.users.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        },
        error: (err: unknown) => {
          this.rowSavingId.set(null);
          this.rowError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito.');
        },
      });
  }

  private loadUsers(tenantId: string): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.adminTenants
      .listTenantUsers(tenantId)
      .pipe(
        catchError((err: unknown) => {
          this.loadError.set(isAppError(err) ? err.message : 'Impossibile caricare gli utenti.');
          return of([] as readonly TenantUser[]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        this.users.set(rows);
        this.loading.set(false);
      });
  }

  private isUserRole(value: string): value is UserRole {
    return (Object.values(UserRole) as readonly string[]).includes(value);
  }
}
