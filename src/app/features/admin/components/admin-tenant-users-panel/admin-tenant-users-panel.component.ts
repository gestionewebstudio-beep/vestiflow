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
  defaultPermissionsForRole,
  type TenantPermissionKey,
} from '@core/models/tenant-permission.model';
import { resolveEffectivePermissions } from '@core/permissions/user-permissions.util';
import { isAppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import { AdminTenantUserPermissionsEditorComponent } from '../admin-tenant-user-permissions-editor/admin-tenant-user-permissions-editor.component';
import type { TenantActiveLocation } from '../../models/admin-tenant.model';
import {
  tenantUserRequiresAssignedLocation,
  type TenantUser,
} from '../../models/admin-tenant-user.model';
import { TENANT_ROLE_OPTIONS, tenantRoleLabel } from '../../models/admin-tenant-role.util';
import { AdminTenantsService } from '../../services/admin-tenants.service';

@Component({
  selector: 'app-admin-tenant-users-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ConfirmDialogComponent,
    SelectMenuComponent,
    AdminTenantUserPermissionsEditorComponent,
  ],
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
  protected readonly rowDeletingId = signal<string | null>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly deleteDialogOpen = signal(false);
  protected readonly userPendingDelete = signal<TenantUser | null>(null);
  protected readonly expandedPermissionsUserId = signal<string | null>(null);
  protected readonly createFormOpen = signal(false);
  protected readonly createPermissions = signal<readonly TenantPermissionKey[]>(
    defaultPermissionsForRole(UserRole.Clerk),
  );

  protected readonly locationOptions = computed(() =>
    this.activeLocations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  );

  protected readonly hasActiveLocations = computed(() => this.activeLocations().length > 0);

  protected readonly createForm = this.fb.group({
    displayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    email: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
    role: this.fb.control<UserRole>(UserRole.Clerk, { validators: [Validators.required] }),
    assignedLocationId: this.fb.control(''),
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

  protected createRequiresLocation(): boolean {
    return tenantUserRequiresAssignedLocation(this.createForm.controls.role.value);
  }

  protected rowRequiresLocation(role: UserRole): boolean {
    return tenantUserRequiresAssignedLocation(role);
  }

  protected isOwnerRole(role: UserRole): boolean {
    return role === UserRole.Owner;
  }

  protected canDeleteUser(user: TenantUser): boolean {
    return !this.isOwnerRole(user.role);
  }

  protected deleteDialogMessage(): string {
    const user = this.userPendingDelete();
    if (!user) {
      return '';
    }
    return `Rimuoverai l'account di ${user.displayName} (${user.email}). L'accesso al gestionale verrà revocato e non potrà più accedere.`;
  }

  protected openDeleteDialog(user: TenantUser): void {
    if (!this.canDeleteUser(user) || this.rowDeletingId()) {
      return;
    }
    this.userPendingDelete.set(user);
    this.deleteDialogOpen.set(true);
  }

  protected confirmDeleteUser(): void {
    const user = this.userPendingDelete();
    const tenantId = this.tenantId();
    if (!user || !tenantId || this.rowDeletingId()) {
      return;
    }

    this.rowDeletingId.set(user.id);
    this.rowError.set(null);

    this.adminTenants
      .deleteTenantUser(tenantId, user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rowDeletingId.set(null);
          this.deleteDialogOpen.set(false);
          this.userPendingDelete.set(null);
          if (this.expandedPermissionsUserId() === user.id) {
            this.expandedPermissionsUserId.set(null);
          }
          this.users.update((rows) => rows.filter((row) => row.id !== user.id));
        },
        error: (err: unknown) => {
          this.rowDeletingId.set(null);
          this.rowError.set(isAppError(err) ? err.message : 'Eliminazione utente non riuscita.');
        },
      });
  }

  protected cancelDeleteUser(): void {
    this.userPendingDelete.set(null);
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
    if (!this.hasActiveLocations()) {
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

  protected effectivePermissions(user: TenantUser): readonly TenantPermissionKey[] {
    return resolveEffectivePermissions({
      role: user.role,
      permissions: [...user.permissions],
    });
  }

  protected onCreateRoleSelect(value: string | null): void {
    if (!value || !this.isUserRole(value)) {
      return;
    }
    this.createForm.controls.role.setValue(value);
    this.createPermissions.set([...defaultPermissionsForRole(value)]);
    if (!tenantUserRequiresAssignedLocation(value)) {
      this.createForm.controls.assignedLocationId.setValue('');
    }
  }

  protected onCreateLocationSelect(value: string | null): void {
    this.createForm.controls.assignedLocationId.setValue(value ?? '');
  }

  protected onCreatePermissionsChange(permissions: readonly TenantPermissionKey[]): void {
    this.createPermissions.set(permissions);
  }

  protected onRowRoleSelect(user: TenantUser, value: string | null): void {
    if (!value || !this.isUserRole(value)) {
      return;
    }
    this.saveUser(user, {
      role: value,
      permissions: [...defaultPermissionsForRole(value)],
    });
  }

  protected onRowLocationSelect(user: TenantUser, value: string | null): void {
    this.saveUser(user, { assignedLocationId: value ?? null });
  }

  protected onRowPermissionsChange(
    user: TenantUser,
    permissions: readonly TenantPermissionKey[],
  ): void {
    this.saveUser(user, { permissions: [...permissions] });
  }

  protected submitCreate(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid || this.createLoading()) {
      return;
    }

    const raw = this.createForm.getRawValue();
    const assignedLocationId = raw.assignedLocationId.trim() || undefined;

    this.createLoading.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    this.adminTenants
      .createTenantUser(this.tenantId(), {
        displayName: raw.displayName.trim(),
        email: raw.email.trim(),
        password: raw.password,
        role: raw.role,
        ...(assignedLocationId ? { assignedLocationId } : {}),
        ...(raw.role !== UserRole.Owner ? { permissions: [...this.createPermissions()] } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.createLoading.set(false);
          this.createSuccess.set(true);
          this.createFormOpen.set(false);
          this.createPermissions.set(defaultPermissionsForRole(UserRole.Clerk));
          this.createForm.reset({
            displayName: '',
            email: '',
            password: '',
            role: UserRole.Clerk,
            assignedLocationId: '',
          });
          this.loadUsers(this.tenantId());
        },
        error: (err: unknown) => {
          this.createLoading.set(false);
          this.createError.set(isAppError(err) ? err.message : 'Creazione utente non riuscita.');
        },
      });
  }

  private saveUser(
    user: TenantUser,
    patch: {
      role?: UserRole;
      assignedLocationId?: string | null;
      permissions?: readonly TenantPermissionKey[];
    },
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
